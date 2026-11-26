import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { canTransitionJob, formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/decorators';
import { pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { AvailabilityAlertsService } from '../availability/alerts.service';
import { CategoriesService } from '../categories/categories.service';
import { ConversationsService } from '../conversations/conversations.service';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { decrypt } from '../../common/crypto';
import { PayoutsService } from '../payments/payouts.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { DisputeDto, JobsQuery, ProposeChangeDto } from './jobs.dto';

type Tx = Prisma.TransactionClient;
export type JobRole = 'customer' | 'professional' | 'admin';

/**
 * Payment state of a job, derived from its method, price, deposit and payments.
 * unpaid → (deposit_paid) → paid | held → paid_out ; refunded when money went back.
 * "awaiting" = the customer says they paid and the professional hasn't confirmed yet;
 * "processing" = a card payment through UNRET is in progress.
 */
export type PaymentState = 'unpaid' | 'awaiting_confirmation' | 'deposit_paid' | 'paid' | 'processing' | 'held' | 'paid_out' | 'refunded';
type Pay = { method: string; status: string; payoutStatus: string; kind?: string; grossMinor?: number; refundedMinor?: number };
export interface PaymentSummary {
  state: PaymentState; totalMinor: number; depositMinor: number; paidMinor: number; remainingMinor: number;
  depositPaid: boolean; awaiting: boolean; processing: boolean;
}
const SETTLED = ['CONFIRMED', 'RECORDED', 'SUCCEEDED', 'PARTIALLY_REFUNDED'];
export function paymentSummary(method: string, payments: Pay[], totalMinor: number, depositMinor = 0): PaymentSummary {
  const live = payments.filter((p) => p.status !== 'FAILED');
  const settled = live.filter((p) => SETTLED.includes(p.status));
  const paidMinor = settled.reduce((s, p) => s + (p.grossMinor ?? totalMinor) - (p.refundedMinor ?? 0), 0);
  const awaiting = live.some((p) => p.status === 'AWAITING_CONFIRMATION');
  const processing = live.some((p) => p.status === 'PENDING');
  const remainingMinor = Math.max(totalMinor - paidMinor, 0);
  const platform = settled.filter((p) => p.method === 'PLATFORM');
  let state: PaymentState;
  if (paidMinor >= totalMinor && paidMinor > 0) state = platform.some((p) => p.payoutStatus === 'HELD') ? 'held' : platform.length ? 'paid_out' : 'paid';
  else if (paidMinor > 0) state = 'deposit_paid';
  else if (processing) state = 'processing';
  else if (awaiting) state = 'awaiting_confirmation';
  else if (live.some((p) => p.status === 'REFUNDED')) state = 'refunded';
  else state = 'unpaid';
  return { state, totalMinor, depositMinor, paidMinor, remainingMinor, depositPaid: depositMinor > 0 && paidMinor >= depositMinor, awaiting, processing };
}
/** Backwards-compatible helper used by lists. */
export function paymentState(method: string, payments: Pay[], totalMinor = 0, depositMinor = 0): PaymentState {
  return paymentSummary(method, payments, totalMinor, depositMinor).state;
}

/** Days after the professional marks a job complete before it auto-completes without customer response. */
export const AUTO_COMPLETE_DAYS = 7;

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private availability: AvailabilityService,
    private conversations: ConversationsService,
    private notifications: NotificationsService,
    private professionals: ProfessionalsService,
    private categories: CategoriesService,
    private storage: StorageService,
    private audit: AuditService,
    private payouts: PayoutsService,
    private alerts: AvailabilityAlertsService,
  ) {}

  /** Resolves the caller's role on a job: customer, the professional (or their company team), or admin. */
  async access(user: AuthUser, jobId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { professional: { select: { userId: true, companyId: true } }, request: { select: { title: true } } } });
    if (!job) throw new NotFoundException('Job not found');
    let role: JobRole | null = null;
    if (job.customerId === user.id) role = 'customer';
    else if (job.professional.userId === user.id || job.assignedMemberUserId === user.id) role = 'professional';
    else if (job.companyId) {
      const m = await this.prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: job.companyId, userId: user.id } } });
      if (m && m.role !== 'MEMBER') role = 'professional';
    }
    if (!role && user.role === 'ADMIN') role = 'admin';
    if (!role) throw new NotFoundException('Job not found');
    return { job, role, otherUserId: role === 'customer' ? job.professional.userId : job.customerId };
  }

  async list(user: AuthUser, q: JobsQuery) {
    const as = q.as ?? 'customer';
    let base: Prisma.JobWhereInput;
    if (as === 'customer') base = { customerId: user.id };
    else if (as === 'company') {
      const memberships = await this.prisma.companyMember.findMany({ where: { userId: user.id, role: { in: ['OWNER', 'MANAGER'] } } });
      base = { companyId: { in: memberships.map((m) => m.companyId) } };
    } else base = { OR: [{ professionalId: user.professionalId ?? '-' }, { assignedMemberUserId: user.id }] };

    const filters: Record<string, Prisma.JobWhereInput> = {
      upcoming: { status: { in: ['ACCEPTED', 'SCHEDULED'] } },
      active: { status: { in: ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'] } },
      completed: { status: 'COMPLETED' },
      cancelled: { status: 'CANCELLED' },
      disputed: { status: 'DISPUTED' },
      all: {},
    };
    const where: Prisma.JobWhereInput = { AND: [base, filters[q.filter ?? 'all']] };
    const locale = (await this.prisma.user.findUnique({ where: { id: user.id }, select: { preferredLanguage: true } }))?.preferredLanguage ?? 'ro';
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({
        where, ...paginate(q),
        orderBy: [{ scheduledStartAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          request: { select: { id: true, title: true, city: true, category: { include: { translations: true } } } },
          customer: { select: { name: true } },
          professional: { select: { id: true, businessName: true, user: { select: { name: true } } } },
          review: { select: { id: true, overall: true } },
          changes: { where: { status: 'PROPOSED' }, select: { id: true } },
          payments: { select: { method: true, status: true, payoutStatus: true, kind: true, grossMinor: true, refundedMinor: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);
    return pageResult(
      rows.map((j) => ({
        id: j.id, status: j.status, title: j.request.title, city: j.request.city,
        categoryName: this.categories.pickName(j.request.category, locale).name,
        agreedPriceMinor: j.agreedPriceMinor, currency: j.currency, priceType: j.priceType,
        scheduledStartAt: j.scheduledStartAt, scheduledEndAt: j.scheduledEndAt, createdAt: j.createdAt, completedAt: j.completedAt,
        customerName: j.customer.name, professionalName: j.professional.businessName ?? j.professional.user.name, professionalId: j.professional.id,
        reviewed: !!j.review, pendingChanges: j.changes.length,
        paymentMethod: j.paymentMethod, paymentState: paymentState(j.paymentMethod, j.payments, j.agreedPriceMinor, j.depositMinor),
        awaitingMyConfirmation: j.status === 'IN_PROGRESS' && (as === 'customer' ? !!j.professionalConfirmedAt && !j.customerConfirmedAt : !j.professionalConfirmedAt),
      })),
      total, q,
    );
  }

  async detail(user: AuthUser, jobId: string) {
    const { role } = await this.access(user, jobId);
    const j = await this.prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        request: { include: { category: { include: { translations: true } }, attachments: true } },
        acceptedRevision: true,
        offer: { include: { revisions: { orderBy: { revision: 'asc' } } } },
        customer: { select: { id: true, name: true, phone: true, email: true, avatarKey: true } },
        professional: { select: { id: true, userId: true, businessName: true, city: true, user: { select: { name: true, phone: true, email: true, avatarKey: true } } } },
        appointment: true,
        changes: { orderBy: { createdAt: 'desc' }, include: { proposedBy: { select: { id: true, name: true } } } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
        payments: { orderBy: { createdAt: 'desc' } },
        review: true,
        disputes: { orderBy: { createdAt: 'desc' } },
        conversations: { select: { id: true } },
        company: { select: { id: true, displayName: true, members: { include: { user: { select: { id: true, name: true } } } } } },
      },
    });
    const locale = (await this.prisma.user.findUnique({ where: { id: user.id }, select: { preferredLanguage: true } }))?.preferredLanguage ?? 'ro';
    const summary = paymentSummary(j.paymentMethod, j.payments, j.agreedPriceMinor, j.depositMinor);
    const assignee = j.assignedMemberUserId ? j.company?.members.find((m) => m.userId === j.assignedMemberUserId)?.user ?? null : null;
    return {
      ...j,
      viewerRole: role,
      categoryName: this.categories.pickName(j.request.category, locale).name,
      request: { ...j.request, category: undefined, attachments: j.request.attachments.map((a) => ({ id: a.id, fileName: a.fileName, url: this.storage.signedUrl(a.fileKey) })) },
      customer: { ...j.customer, avatarUrl: this.storage.signedUrl(j.customer.avatarKey) },
      professional: { ...j.professional, displayName: j.professional.businessName ?? j.professional.user.name, avatarUrl: this.storage.signedUrl(j.professional.user.avatarKey) },
      conversationId: j.conversations[0]?.id ?? null,
      conversations: undefined,
      assignee,
      company: role === 'professional' ? j.company : j.company ? { id: j.company.id, displayName: j.company.displayName } : null,
      paymentState: summary.state,
      payment: summary,
      paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
      payTo: role === 'customer' && ['TRANSFER', 'DIRECT'].includes(j.paymentMethod) && summary.remainingMinor > 0 ? await this.payTo(j.professionalId) : null,
      allowedActions: this.allowedActions({ ...j, summary }, role, user.id),
    };
  }

  /** Bank details shown to the hired customer for a transfer, if the professional allows it. */
  private async payTo(professionalId: string) {
    const acc = await this.prisma.payoutAccount.findUnique({ where: { professionalId } });
    if (!acc || !acc.showToCustomers) return null;
    try { return { holderName: acc.holderName, iban: decrypt(acc.ibanEncrypted) }; } catch { return null; }
  }

  private allowedActions(j: { status: JobStatus; customerConfirmedAt: Date | null; professionalConfirmedAt: Date | null; review: unknown; completedAt: Date | null; paymentMethod: string; summary: PaymentSummary }, role: JobRole, _uid: string) {
    const a: string[] = [];
    const open = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'].includes(j.status);
    if (role === 'professional' && ['ACCEPTED', 'SCHEDULED'].includes(j.status)) a.push('start');
    if (j.status === 'IN_PROGRESS') {
      if (role === 'professional' && !j.professionalConfirmedAt) a.push('confirm_completion');
      if (role === 'customer' && !j.customerConfirmedAt) a.push('confirm_completion');
    }
    if (open && role !== 'admin') a.push('propose_change', 'cancel');
    if (['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(j.status) && role !== 'admin') a.push('open_dispute');
    if (j.status === 'COMPLETED' && role === 'customer' && !j.review) a.push('review');
    const payable = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(j.status);
    const direct = j.paymentMethod !== 'PLATFORM';
    const p = j.summary;
    const nothingYet = p.paidMinor === 0 && !p.awaiting && !p.processing;
    if (payable && role === 'customer' && nothingYet) a.push('change_payment_method');
    if (payable && role === 'customer' && direct && j.paymentMethod !== 'CASH' && p.remainingMinor > 0 && !p.awaiting) a.push('mark_paid');
    if ((payable || j.status === 'DISPUTED') && role === 'professional' && direct && p.remainingMinor > 0) a.push('confirm_payment');
    // Also while a payment page is open: starting a new one first checks the old page with the provider (no double charge).
    if (payable && role === 'customer' && !direct && p.remainingMinor > 0) {
      if (p.depositMinor > 0 && p.paidMinor === 0) a.push('pay_deposit');
      a.push('pay_online');
    }
    return a;
  }

  private async transition(tx: Tx, jobId: string, from: JobStatus, to: JobStatus, actorId: string | null, type = 'STATUS_CHANGE', note?: string, extra: Prisma.JobUpdateManyMutationInput = {}) {
    if (!canTransitionJob(from, to)) throw new BadRequestException(`Cannot move job from ${from} to ${to}`);
    const res = await tx.job.updateMany({ where: { id: jobId, status: from }, data: { status: to, ...extra } });
    if (!res.count) throw new ConflictException('Job status changed concurrently; reload and try again');
    await tx.jobEvent.create({ data: { jobId, actorId, fromStatus: from, toStatus: to, type, note } });
  }

  async start(user: AuthUser, jobId: string) {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role !== 'professional') throw new ForbiddenException('Only the professional can start the job');
    await this.prisma.$transaction((tx) => this.transition(tx, jobId, job.status, 'IN_PROGRESS', user.id));
    await this.payouts.releaseDeposit(jobId);
    await this.notifyStatus(otherUserId, jobId, job.request.title, 'Work has started');
    return this.detail(user, jobId);
  }

  /** Completion requires both parties' confirmation; the professional's confirmation auto-completes after 7 days. */
  async confirmCompletion(user: AuthUser, jobId: string) {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException();
    if (job.status !== 'IN_PROGRESS') throw new BadRequestException('Only jobs in progress can be completed');
    const field = role === 'customer' ? 'customerConfirmedAt' : 'professionalConfirmedAt';
    if (job[field]) throw new BadRequestException('You already confirmed completion');
    const now = new Date();
    const bothConfirmed = role === 'customer' ? !!job.professionalConfirmedAt : !!job.customerConfirmedAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: { [field]: now } });
      await tx.jobEvent.create({ data: { jobId, actorId: user.id, type: 'CONFIRMED', note: `${role} confirmed completion` } });
      if (bothConfirmed) {
        await this.transition(tx, jobId, 'IN_PROGRESS', 'COMPLETED', user.id, 'STATUS_CHANGE', 'Both parties confirmed', { completedAt: now });
        await tx.appointment.updateMany({ where: { jobId, status: 'RESERVED' }, data: { status: 'DONE' } });
      }
    });
    if (bothConfirmed) {
      await this.payouts.releaseForJob(jobId);
      await this.professionals.recomputeReputation(job.professionalId);
      await this.notifyStatus(otherUserId, jobId, job.request.title, 'Job completed');
      if (role === 'professional') await this.notifyStatus(job.customerId, jobId, job.request.title, 'Job completed — please leave a review');
    } else {
      await this.notifyStatus(
        otherUserId, jobId, job.request.title,
        role === 'professional'
          ? `The professional marked the job as finished. Please confirm, or open a dispute within ${AUTO_COMPLETE_DAYS} days.`
          : 'The customer confirmed the job is finished. Please confirm completion.',
      );
    }
    return this.detail(user, jobId);
  }

  /** Called by the scheduler. */
  async autoComplete() {
    const cutoff = new Date(Date.now() - AUTO_COMPLETE_DAYS * 864e5);
    const due = await this.prisma.job.findMany({
      where: { status: 'IN_PROGRESS', professionalConfirmedAt: { lt: cutoff }, customerConfirmedAt: null },
      include: { request: { select: { title: true } } },
    });
    for (const j of due) {
      await this.prisma.$transaction(async (tx) => {
        await this.transition(tx, j.id, 'IN_PROGRESS', 'COMPLETED', null, 'AUTO_COMPLETED', `No customer response within ${AUTO_COMPLETE_DAYS} days`, { completedAt: new Date() });
        await tx.appointment.updateMany({ where: { jobId: j.id, status: 'RESERVED' }, data: { status: 'DONE' } });
      });
      await this.payouts.releaseForJob(j.id);
      await this.professionals.recomputeReputation(j.professionalId);
      await this.notifyStatus(j.customerId, j.id, j.request.title, 'Job automatically marked as completed');
    }
    return due.length;
  }

  async cancel(user: AuthUser, jobId: string, reason: string) {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException('Admins resolve disputes instead');
    if (!['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'].includes(job.status)) throw new BadRequestException('This job can no longer be cancelled');
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, jobId, job.status, 'CANCELLED', user.id, role === 'professional' ? 'CANCELLED_BY_PROFESSIONAL' : 'CANCELLED_BY_CUSTOMER', reason, {
        cancelledAt: new Date(), cancelledById: user.id, cancellationReason: reason,
      });
      await this.availability.release(tx, jobId);
      await tx.jobChange.updateMany({ where: { jobId, status: 'PROPOSED' }, data: { status: 'WITHDRAWN' } });
      await this.audit.log({ actorId: user.id, action: 'job.cancel', entityType: 'Job', entityId: jobId, metadata: { role, reason } }, tx);
    });
    await this.payouts.refundHeldForJob(jobId, `Job cancelled by the ${role}`);
    void this.alerts.check(job.professionalId); // the freed time may be what someone is waiting for
    await this.professionals.recomputeReputation(job.professionalId);
    await this.notifications.notify({
      userId: otherUserId, type: 'JOB_CANCELLED', title: 'Job cancelled',
      body: `"${job.request.title}" was cancelled by the ${role}. Reason: ${reason}`, data: { jobId, url: `/jobs/${jobId}` },
    });
    return this.detail(user, jobId);
  }

  /** Any change to price, scope or schedule is recorded and must be explicitly accepted by the other party. */
  async proposeChange(user: AuthUser, jobId: string, dto: ProposeChangeDto) {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException();
    if (!['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'].includes(job.status)) throw new BadRequestException('Job is closed');
    if (dto.priceMinor === undefined && !dto.scope && !dto.scheduledStartAt) throw new BadRequestException('Propose at least one change');
    if (!!dto.scheduledStartAt !== !!dto.scheduledEndAt) throw new BadRequestException('Provide both start and end time');
    if (dto.scheduledStartAt && new Date(dto.scheduledEndAt!) <= new Date(dto.scheduledStartAt)) throw new BadRequestException('End must be after start');
    if (await this.prisma.jobChange.count({ where: { jobId, status: 'PROPOSED' } })) throw new ConflictException('There is already a pending change. Respond to or withdraw it first.');

    const change = await this.prisma.$transaction(async (tx) => {
      const c = await tx.jobChange.create({
        data: {
          jobId, proposedById: user.id, priceMinor: dto.priceMinor, scope: dto.scope, reason: dto.reason,
          scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : null,
          scheduledEndAt: dto.scheduledEndAt ? new Date(dto.scheduledEndAt) : null,
          previous: { priceMinor: job.agreedPriceMinor, scope: job.scope, scheduledStartAt: job.scheduledStartAt, scheduledEndAt: job.scheduledEndAt },
        },
      });
      await tx.jobEvent.create({ data: { jobId, actorId: user.id, type: 'CHANGE_PROPOSED', note: dto.reason } });
      return c;
    });
    await this.audit.log({ actorId: user.id, action: 'job.change.propose', entityType: 'Job', entityId: jobId, metadata: { changeId: change.id, ...dto } });
    const parts = [
      dto.priceMinor !== undefined ? `price ${formatMoney(job.agreedPriceMinor, job.currency)} → ${formatMoney(dto.priceMinor, job.currency)}` : null,
      dto.scope ? 'scope' : null,
      dto.scheduledStartAt ? 'appointment time' : null,
    ].filter(Boolean);
    await this.notifications.notify({
      userId: otherUserId, type: 'JOB_CHANGE_PROPOSED', title: 'Change to your job proposed',
      body: `Proposed change: ${parts.join(', ')}. Your approval is required.`, data: { jobId, changeId: change.id, url: `/jobs/${jobId}` },
    });
    return this.detail(user, jobId);
  }

  async respondChange(user: AuthUser, jobId: string, changeId: string, decision: 'accept' | 'reject') {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException();
    const change = await this.prisma.jobChange.findFirst({ where: { id: changeId, jobId } });
    if (!change || change.status !== 'PROPOSED') throw new NotFoundException('No pending change');
    if (change.proposedById === user.id) throw new ForbiddenException('The other party must respond to your proposal');

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.jobChange.updateMany({
        where: { id: changeId, status: 'PROPOSED' },
        data: { status: decision === 'accept' ? 'ACCEPTED' : 'REJECTED', respondedById: user.id, respondedAt: new Date() },
      });
      if (!res.count) throw new ConflictException('Change already handled');
      await tx.jobEvent.create({ data: { jobId, actorId: user.id, type: decision === 'accept' ? 'CHANGE_ACCEPTED' : 'CHANGE_REJECTED' } });
      if (decision === 'accept') {
        const data: Prisma.JobUpdateInput = {};
        if (change.priceMinor !== null) {
          data.agreedPriceMinor = change.priceMinor;
          if (job.depositMinor > 0 && job.agreedPriceMinor > 0) data.depositMinor = Math.min(change.priceMinor, Math.round((job.depositMinor * change.priceMinor) / job.agreedPriceMinor));
        }
        if (change.scope) data.scope = change.scope;
        if (change.scheduledStartAt && change.scheduledEndAt) {
          await this.availability.reserve(tx, job.professionalId, jobId, change.scheduledStartAt, change.scheduledEndAt);
          data.scheduledStartAt = change.scheduledStartAt;
          data.scheduledEndAt = change.scheduledEndAt;
        }
        await tx.job.update({ where: { id: jobId }, data });
        if (change.scheduledStartAt && job.status === 'ACCEPTED')
          await this.transition(tx, jobId, 'ACCEPTED', 'SCHEDULED', user.id, 'STATUS_CHANGE', 'Appointment agreed');
      }
      await this.audit.log({ actorId: user.id, action: `job.change.${decision}`, entityType: 'Job', entityId: jobId, metadata: { changeId } }, tx);
    });
    await this.notifyStatus(otherUserId, jobId, job.request.title, decision === 'accept' ? 'Your proposed change was accepted' : 'Your proposed change was declined');
    return this.detail(user, jobId);
  }

  async withdrawChange(user: AuthUser, jobId: string, changeId: string) {
    await this.access(user, jobId);
    const res = await this.prisma.jobChange.updateMany({ where: { id: changeId, jobId, proposedById: user.id, status: 'PROPOSED' }, data: { status: 'WITHDRAWN' } });
    if (!res.count) throw new NotFoundException();
    return this.detail(user, jobId);
  }

  async openDispute(user: AuthUser, jobId: string, dto: DisputeDto) {
    const { job, role, otherUserId } = await this.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException();
    if (!['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(job.status)) throw new BadRequestException('A dispute cannot be opened for this job');
    if (job.status === 'COMPLETED' && job.completedAt && job.completedAt.getTime() < Date.now() - 30 * 864e5)
      throw new BadRequestException('Disputes must be opened within 30 days of completion');
    const dispute = await this.prisma.$transaction(async (tx) => {
      await this.transition(tx, jobId, job.status, 'DISPUTED', user.id, 'DISPUTE_OPENED', dto.reason);
      const d = await tx.dispute.create({ data: { jobId, openedById: user.id, reason: dto.reason, details: dto.details } });
      await this.audit.log({ actorId: user.id, action: 'dispute.open', entityType: 'Dispute', entityId: d.id, metadata: { jobId, previousStatus: job.status } }, tx);
      return d;
    });
    await this.notifications.notify({
      userId: otherUserId, type: 'DISPUTE_UPDATED', title: 'A dispute was opened',
      body: `A dispute was opened for "${job.request.title}". The UNRET team will review it.`, data: { jobId, disputeId: dispute.id, url: `/jobs/${jobId}` },
    });
    return this.detail(user, jobId);
  }

  /** Admin resolution: outcome sets the job's final (or resumed) status. */
  async resolveDispute(admin: AuthUser, disputeId: string, outcome: 'COMPLETED' | 'CANCELLED' | 'IN_PROGRESS', resolution: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id: disputeId }, include: { job: { include: { professional: { select: { userId: true } }, request: { select: { title: true } } } } } });
    if (!d) throw new NotFoundException();
    if (d.status === 'RESOLVED') throw new BadRequestException('Dispute already resolved');
    await this.prisma.$transaction(async (tx) => {
      await tx.dispute.update({ where: { id: disputeId }, data: { status: 'RESOLVED', resolution, resolvedById: admin.id, resolvedAt: new Date() } });
      if (d.job.status === 'DISPUTED') {
        await this.transition(tx, d.jobId, 'DISPUTED', outcome, admin.id, 'DISPUTE_RESOLVED', resolution, {
          ...(outcome === 'COMPLETED' ? { completedAt: d.job.completedAt ?? new Date() } : {}),
          ...(outcome === 'CANCELLED' ? { cancelledAt: new Date(), cancellationReason: `Dispute resolution: ${resolution}` } : {}),
        });
        if (outcome === 'CANCELLED') await this.availability.release(tx, d.jobId);
      }
      await this.audit.log({ actorId: admin.id, action: 'admin.dispute.resolve', entityType: 'Dispute', entityId: disputeId, metadata: { outcome, resolution } }, tx);
    });
    if (outcome === 'COMPLETED') await this.payouts.releaseForJob(d.jobId);
    if (outcome === 'CANCELLED') { await this.payouts.refundHeldForJob(d.jobId, 'Dispute resolved by cancelling the job'); void this.alerts.check(d.job.professionalId); }
    await this.professionals.recomputeReputation(d.job.professionalId);
    for (const uid of [d.job.customerId, d.job.professional.userId])
      await this.notifications.notify({ userId: uid, type: 'DISPUTE_UPDATED', title: 'Dispute resolved', body: `"${d.job.request.title}": ${resolution}`, data: { jobId: d.jobId, url: `/jobs/${d.jobId}` } });
    return { ok: true };
  }

  /**
   * An administrator steps in on a job that is stuck (e.g. the professional disappeared, or both agree it is done):
   * cancel (money still held by UNRET is refunded) or complete (held money is paid out). Both people are told why.
   */
  async adminSetStatus(admin: AuthUser, jobId: string, to: 'CANCELLED' | 'COMPLETED', note: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { professional: { select: { userId: true } }, request: { select: { title: true } } } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status === to) throw new BadRequestException(`The job is already ${to.toLowerCase()}`);
    const allowed = to === 'CANCELLED' ? ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'DISPUTED'] : ['IN_PROGRESS', 'SCHEDULED', 'ACCEPTED', 'DISPUTED'];
    if (!allowed.includes(job.status)) throw new BadRequestException(`A ${job.status.toLowerCase()} job cannot be ${to === 'CANCELLED' ? 'cancelled' : 'completed'}`);
    await this.prisma.$transaction(async (tx) => {
      // Admins may complete an accepted/scheduled job directly (e.g. work done but nobody pressed "start").
      const res = await tx.job.updateMany({
        where: { id: jobId, status: job.status },
        data: to === 'CANCELLED'
          ? { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: admin.id, cancellationReason: `UNRET support: ${note}` }
          : { status: 'COMPLETED', completedAt: new Date(), customerConfirmedAt: job.customerConfirmedAt ?? new Date(), professionalConfirmedAt: job.professionalConfirmedAt ?? new Date() },
      });
      if (!res.count) throw new BadRequestException('The job changed meanwhile; reload and try again');
      await tx.jobEvent.create({ data: { jobId, actorId: admin.id, fromStatus: job.status, toStatus: to, type: 'ADMIN_ACTION', note } });
      if (to === 'CANCELLED') await this.availability.release(tx, jobId);
      await tx.dispute.updateMany({ where: { jobId, status: { in: ['OPEN', 'UNDER_REVIEW'] } }, data: { status: 'RESOLVED', resolution: note, resolvedById: admin.id, resolvedAt: new Date() } });
      await this.audit.log({ actorId: admin.id, action: `admin.job.${to === 'CANCELLED' ? 'cancel' : 'complete'}`, entityType: 'Job', entityId: jobId, metadata: { from: job.status, note } }, tx);
    });
    if (to === 'COMPLETED') await this.payouts.releaseForJob(jobId);
    else { await this.payouts.refundHeldForJob(jobId, 'Cancelled by UNRET support'); void this.alerts.check(job.professionalId); }
    await this.professionals.recomputeReputation(job.professionalId);
    for (const uid of [job.customerId, job.professional.userId]) {
      await this.notifications.notify({
        userId: uid, type: to === 'CANCELLED' ? 'JOB_CANCELLED' : 'JOB_STATUS_CHANGED',
        title: to === 'CANCELLED' ? 'Job cancelled by UNRET support' : 'Job marked as completed by UNRET support',
        body: `"${job.request.title}": ${note}`, data: { jobId, url: `/jobs/${jobId}` },
      });
    }
    return { ok: true };
  }

  /** Company owner/manager assigns the job to a team member. */
  async assign(user: AuthUser, jobId: string, memberUserId: string) {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job?.companyId) throw new BadRequestException('Only company jobs can be assigned');
    const me = await this.prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: job.companyId, userId: user.id } } });
    if (!me || me.role === 'MEMBER') throw new ForbiddenException('Only company owners and managers can assign jobs');
    const member = await this.prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: job.companyId, userId: memberUserId } } });
    if (!member) throw new BadRequestException('User is not a member of this company');
    await this.prisma.$transaction([
      this.prisma.job.update({ where: { id: jobId }, data: { assignedMemberUserId: memberUserId } }),
      this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'ASSIGNED', note: `Assigned to team member` } }),
    ]);
    await this.notifyStatus(memberUserId, jobId, '', 'A job was assigned to you');
    return this.detail(user, jobId);
  }

  private notifyStatus(userId: string, jobId: string, title: string, body: string) {
    return this.notifications.notify({ userId, type: 'JOB_STATUS_CHANGED', title: title ? `Update: ${title}` : 'Job update', body, data: { jobId, url: `/jobs/${jobId}` } });
  }
}
