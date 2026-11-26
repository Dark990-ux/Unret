import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Global, Headers, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, Min } from 'class-validator';
import { checkIban, formatMoney, maskIban } from '@unret/shared';
import { decrypt, encrypt } from '../../common/crypto';
import { requirePro } from '../../common/guards';
import { AuditService } from '../../common/audit.service';
import { AuthUser, ClientIp, CurrentUser, Public, Permission, Roles } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { JobsService, paymentSummary } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PAYMENT_PROVIDER, PayoutsService } from './payouts.service';
import { StripePaymentProvider } from './stripe.provider';
import { SubscriptionsService } from '../subscriptions/subscriptions.module';
import { MockPaymentProvider, PaymentProvider } from './provider';

type Part = 'deposit' | 'balance' | 'full';
class PartDto {
  @IsOptional() @IsIn(['deposit', 'balance', 'full']) part?: Part;
  /** Where the payment page sends the customer back to (must be an UNRET address). */
  @IsOptional() @IsString() @MaxLength(500) returnUrl?: string;
}
class ReturnUrlDto {
  @IsOptional() @IsString() @MaxLength(500) returnUrl?: string;
}
class PayoutAccountDto {
  @IsString() @Length(3, 120) holderName: string;
  @IsOptional() @IsString() @Length(15, 42) iban?: string;
  @IsOptional() @IsBoolean() showToCustomers?: boolean;
}
class ConfirmDto {
  @IsOptional() @IsIn(['deposit', 'balance', 'full']) part?: Part;
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class MarkPaidDto {
  @IsOptional() @IsIn(['deposit', 'balance', 'full']) part?: Part;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class MethodDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
}
class RefundDto {
  @IsInt() @Min(1) amountMinor: number;
  @IsString() @MaxLength(500) reason: string;
}

const PAYABLE_JOB = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private jobs: JobsService,
    private payouts: PayoutsService,
    private notifications: NotificationsService,
    private audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
    private subscriptions: SubscriptionsService,
  ) {}

  private async summaryFor(job: { id: string; paymentMethod: string; agreedPriceMinor: number; depositMinor: number }) {
    const payments = await this.prisma.payment.findMany({ where: { jobId: job.id } });
    return paymentSummary(job.paymentMethod, payments, job.agreedPriceMinor, job.depositMinor);
  }

  /** Amount and kind for the next payment: the deposit first (if any), then whatever remains. */
  private nextCharge(s: ReturnType<typeof paymentSummary>, part: Part | undefined): { amount: number; kind: 'FULL' | 'DEPOSIT' | 'BALANCE' } {
    if (s.remainingMinor <= 0) throw new BadRequestException('This job is already paid');
    if (part === 'deposit') {
      if (s.depositMinor <= 0) throw new BadRequestException('No deposit was requested for this job');
      if (s.paidMinor > 0) throw new BadRequestException('The deposit is already paid');
      return { amount: s.depositMinor, kind: 'DEPOSIT' };
    }
    return { amount: s.remainingMinor, kind: s.paidMinor > 0 ? 'BALANCE' : 'FULL' };
  }

  // ── Payout account (IBAN) ──

  async getPayoutAccount(user: AuthUser) {
    const acc = await this.prisma.payoutAccount.findUnique({ where: { professionalId: requirePro(user) } });
    if (!acc) return null;
    const waiting = await this.prisma.payment.aggregate({ where: { job: { professionalId: user.professionalId! }, method: 'PLATFORM', payoutStatus: 'HELD', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, _sum: { payoutMinor: true } });
    return { holderName: acc.holderName, ibanMasked: maskIban(acc.countryCode, acc.ibanLast4), countryCode: acc.countryCode, bankCode: acc.bankCode, showToCustomers: acc.showToCustomers, updatedAt: acc.updatedAt, heldMinor: waiting._sum.payoutMinor ?? 0 };
  }

  async setPayoutAccount(user: AuthUser, dto: PayoutAccountDto, ip?: string) {
    const pid = requirePro(user);
    if (!dto.iban) {
      // Only the name or visibility changes; keep the stored IBAN.
      const existing = await this.prisma.payoutAccount.findUnique({ where: { professionalId: pid } });
      if (!existing) throw new BadRequestException('Enter your IBAN');
      await this.prisma.payoutAccount.update({ where: { professionalId: pid }, data: { holderName: dto.holderName.trim(), showToCustomers: dto.showToCustomers ?? existing.showToCustomers } });
      return this.getPayoutAccount(user);
    }
    const check = checkIban(dto.iban);
    if (!check.valid) throw new BadRequestException(check.reason);
    const data = { holderName: dto.holderName.trim(), ibanEncrypted: encrypt(check.iban), ibanLast4: check.iban.slice(-4), countryCode: check.country, bankCode: check.bankCode, showToCustomers: dto.showToCustomers ?? true };
    await this.prisma.payoutAccount.upsert({ where: { professionalId: pid }, create: { professionalId: pid, ...data }, update: data });
    await this.audit.log({ actorId: user.id, action: 'payout_account.set', entityType: 'PayoutAccount', entityId: pid, metadata: { last4: data.ibanLast4, country: data.countryCode }, ip });
    await this.payouts.releaseWaiting(pid);
    return this.getPayoutAccount(user);
  }

  async removePayoutAccount(user: AuthUser) {
    const pid = requirePro(user);
    await this.prisma.payoutAccount.deleteMany({ where: { professionalId: pid } });
    await this.audit.log({ actorId: user.id, action: 'payout_account.remove', entityType: 'PayoutAccount', entityId: pid });
    return { ok: true };
  }

  /** Customer changes how they will pay, as long as nothing has been paid yet. */
  async setMethod(user: AuthUser, jobId: string, method: PaymentMethod) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException('Only the customer can change the payment method');
    if (method === 'DIRECT') throw new BadRequestException('Choose card / bank transfer, cash or payment through UNRET');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job can no longer be paid');
    if ((await this.summaryFor(job)).paidMinor > 0) throw new BadRequestException('Part of this job is already paid, so the method can no longer change');
    await this.prisma.$transaction([
      this.prisma.job.update({ where: { id: jobId }, data: { paymentMethod: method } }),
      this.prisma.payment.updateMany({ where: { jobId, status: { in: ['AWAITING_CONFIRMATION', 'PENDING'] } }, data: { status: 'FAILED' } }),
      this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_METHOD_CHANGED', note: method } }),
    ]);
    await this.notifications.notify({ userId: otherUserId, type: 'JOB_STATUS_CHANGED', title: 'Payment method changed', body: `The customer will pay for "${job.request.title}" ${({ TRANSFER: 'by card / bank transfer', CASH: 'in cash', PLATFORM: 'through UNRET' } as Record<string, string>)[method]}.`, data: { jobId, url: `/jobs/${jobId}` } });
    return this.jobs.detail(user, jobId);
  }

  /** Card / bank transfer: the customer tells the professional the money was sent. */
  async markPaid(user: AuthUser, jobId: string, dto: MarkPaidDto) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException();
    if (!['TRANSFER', 'CASH', 'DIRECT'].includes(job.paymentMethod)) throw new BadRequestException('This job is paid through UNRET');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job can no longer be paid');
    const s = await this.summaryFor(job);
    const { amount, kind } = this.nextCharge(s, dto.part ?? (s.depositMinor > 0 && s.paidMinor === 0 ? 'deposit' : 'full'));
    const existing = await this.prisma.payment.findFirst({ where: { jobId, status: 'AWAITING_CONFIRMATION' } });
    if (!existing) {
      await this.prisma.payment.create({
        data: { jobId, method: job.paymentMethod, kind, grossMinor: amount, payoutMinor: amount, currency: job.currency, status: 'AWAITING_CONFIRMATION', customerMarkedPaidAt: new Date(), paymentMethodNote: dto.note || null },
      });
      await this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_MARKED_PAID', note: `${formatMoney(amount, job.currency)}${kind === 'DEPOSIT' ? ' · deposit' : ''}` } });
    }
    await this.notifications.notify({
      userId: otherUserId, type: 'PAYMENT_TO_CONFIRM', title: 'Please confirm the payment',
      body: `The customer says they paid ${formatMoney(amount, job.currency)}${kind === 'DEPOSIT' ? ' (deposit)' : ''} for "${job.request.title}". Confirm in the app once you receive it.`,
      data: { jobId, url: `/jobs/${jobId}` },
    });
    return this.jobs.detail(user, jobId);
  }

  /** Card / bank transfer or cash: only the professional confirms the money arrived. */
  async confirmReceived(user: AuthUser, jobId: string, dto: ConfirmDto) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'professional') throw new ForbiddenException('Only the professional can confirm receiving the payment');
    if (job.paymentMethod === 'PLATFORM') throw new BadRequestException('Payments through UNRET are confirmed automatically');
    if (!PAYABLE_JOB.includes(job.status) && job.status !== 'DISPUTED') throw new BadRequestException('This job can no longer be paid');
    const s = await this.summaryFor(job);
    const awaiting = await this.prisma.payment.findFirst({ where: { jobId, status: 'AWAITING_CONFIRMATION' } });
    const next = this.nextCharge(s, dto.part ?? (awaiting ? (awaiting.kind === 'DEPOSIT' ? 'deposit' : 'full') : undefined));
    const amount = dto.amountMinor ?? awaiting?.grossMinor ?? next.amount;
    if (amount <= 0) throw new BadRequestException('Enter the amount you received');
    if (amount > s.remainingMinor) throw new BadRequestException(`The amount left to pay is ${formatMoney(s.remainingMinor, job.currency)}`);
    const kind = s.paidMinor > 0 ? 'BALANCE' : amount < s.totalMinor ? 'DEPOSIT' : 'FULL';
    const now = new Date();
    const data = { status: 'CONFIRMED' as const, kind: kind as 'FULL' | 'DEPOSIT' | 'BALANCE', grossMinor: amount, payoutMinor: amount, confirmedById: user.id, confirmedAt: now, payoutStatus: 'NOT_APPLICABLE' as const };
    const p = awaiting
      ? await this.prisma.payment.update({ where: { id: awaiting.id }, data: { ...data, paymentMethodNote: dto.note ?? awaiting.paymentMethodNote } })
      : await this.prisma.payment.create({ data: { ...data, jobId, method: job.paymentMethod, currency: job.currency, paymentMethodNote: dto.note || null } });
    await this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_CONFIRMED', note: `${formatMoney(amount, job.currency)} · ${job.paymentMethod === 'CASH' ? 'cash' : 'transfer'}` } });
    await this.audit.log({ actorId: user.id, action: 'payment.confirm', entityType: 'Payment', entityId: p.id, metadata: { jobId, amount, method: job.paymentMethod } });
    await this.notifications.notify({
      userId: otherUserId, type: 'PAYMENT_COMPLETED', title: 'Payment confirmed',
      body: `The professional confirmed receiving ${formatMoney(amount, job.currency)} for "${job.request.title}".`,
      data: { jobId, url: `/jobs/${jobId}` },
    });
    return this.jobs.detail(user, jobId);
  }

  /** Through UNRET: the customer pays by card; the money is held until the job is completed. */
  /** Only UNRET's own pages (website, app) may be used as return addresses, so the payment page cannot redirect elsewhere. */
  private safeReturnUrl(url: string | undefined, fallbackPath: string) {
    const origins = [...(process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','), ...(process.env.APP_ORIGINS ?? '').split(',')].map((o) => o.trim()).filter(Boolean);
    const fallback = origins[0] + fallbackPath;
    if (!url) return fallback;
    if (url.startsWith('unret://')) return url;
    try {
      const u = new URL(url);
      return origins.some((o) => new URL(o).origin === u.origin) ? u.toString() : fallback;
    } catch {
      return fallback;
    }
  }

  async createPlatformPayment(user: AuthUser, jobId: string, part?: Part, returnUrl?: string) {
    const { job, role } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException('Only the customer can pay for the job');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job cannot be paid');
    // An earlier payment page may still be open (or was paid but the result has not arrived yet).
    for (const old of await this.prisma.payment.findMany({ where: { jobId, status: 'PENDING', method: 'PLATFORM' } })) {
      if (!old.providerReference || old.provider !== this.provider.name) continue;
      const status = await this.provider.paymentStatus(old.providerReference);
      if (status === 'SUCCEEDED') await this.markResult(old.providerReference, 'SUCCEEDED');
      else await this.provider.cancelIntent(old.providerReference).catch(() => undefined);
    }
    await this.prisma.payment.updateMany({ where: { jobId, status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] } }, data: { status: 'FAILED' } });
    const { amount, kind } = this.nextCharge(await this.summaryFor(job), part);

    const country = await this.prisma.user.findUniqueOrThrow({ where: { id: job.customerId }, select: { country: true } });
    const platformFeeMinor = Math.round((amount * country.country.platformFeeBps) / 10000);
    const customer = await this.prisma.user.findUnique({ where: { id: job.customerId }, select: { email: true } });
    const description = `${job.request.title} · ${kind === 'DEPOSIT' ? 'deposit' : kind === 'BALANCE' ? 'rest of the price' : 'payment'}`;
    const intent = await this.provider.createIntent({ amountMinor: amount, currency: job.currency, platformFeeMinor, jobId, description, returnUrl: this.safeReturnUrl(returnUrl, `/jobs/${jobId}`), customerEmail: customer?.email });
    const payment = await this.prisma.payment.create({
      data: {
        jobId, method: 'PLATFORM', kind, provider: this.provider.name, providerReference: intent.reference,
        grossMinor: amount, platformFeeMinor, providerFeeMinor: intent.providerFeeMinor,
        payoutMinor: Math.max(amount - platformFeeMinor - intent.providerFeeMinor, 0),
        currency: job.currency, status: 'PENDING', payoutStatus: 'HELD',
      },
    });
    if (job.paymentMethod !== 'PLATFORM') await this.prisma.job.update({ where: { id: jobId }, data: { paymentMethod: 'PLATFORM' } });
    return { paymentId: payment.id, kind, provider: this.provider.name, clientSecret: intent.clientSecret, checkoutUrl: intent.checkoutUrl, amountMinor: payment.grossMinor, currency: payment.currency, platformFeeMinor, payoutMinor: payment.payoutMinor };
  }

  async markResult(reference: string, status: 'SUCCEEDED' | 'FAILED') {
    const p = await this.prisma.payment.findUnique({ where: { providerReference: reference }, include: { job: { include: { professional: { select: { userId: true } }, request: { select: { title: true } } } } } });
    if (!p) return;
    // Money that really arrived is always recorded, even for a page that was replaced in the meantime.
    const late = p.status === 'FAILED' && status === 'SUCCEEDED';
    if (p.status !== 'PENDING' && !late) return;
    if (late) await this.audit.log({ action: 'payment.late_success', entityType: 'Payment', entityId: p.id, metadata: { reference } });
    await this.prisma.payment.update({ where: { id: p.id }, data: { status } });
    await this.audit.log({ action: `payment.${status.toLowerCase()}`, entityType: 'Payment', entityId: p.id, metadata: { reference } });
    if (status !== 'SUCCEEDED') return;
    await this.prisma.jobEvent.create({ data: { jobId: p.jobId, type: 'PAYMENT_SUCCEEDED', note: formatMoney(p.grossMinor, p.currency) } });
    await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: p.kind === 'DEPOSIT' ? 'Deposit received by UNRET' : 'Payment received by UNRET', body: p.kind === 'DEPOSIT' ? `${formatMoney(p.grossMinor, p.currency)} deposit for "${p.job.request.title}" is held and released to the professional when the work starts.` : `${formatMoney(p.grossMinor, p.currency)} for "${p.job.request.title}" is held safely and sent to the professional when the job is done.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
    await this.notifications.notify({ userId: p.job.professional.userId, type: 'PAYMENT_COMPLETED', title: 'The customer paid through UNRET', body: `${formatMoney(p.grossMinor, p.currency)} for "${p.job.request.title}" is held by UNRET and sent to you when the job is completed.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
    if (p.job.status === 'COMPLETED') await this.payouts.releaseForJob(p.jobId);
    else if (p.kind === 'DEPOSIT' && p.job.status === 'IN_PROGRESS') await this.payouts.releaseDeposit(p.jobId);
  }

  async mockConfirm(user: AuthUser, paymentId: string, outcome: 'succeed' | 'fail') {
    if (this.provider.name !== 'mock') throw new NotFoundException();
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { job: true } });
    if (!p || p.job.customerId !== user.id) throw new NotFoundException();
    await this.markResult(p.providerReference!, outcome === 'succeed' ? 'SUCCEEDED' : 'FAILED');
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  /** Asks the provider for the result of a pending payment (used when the customer returns from the payment page). */
  async sync(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { job: true } });
    if (!p || (p.job.customerId !== user.id && user.role !== 'ADMIN')) throw new NotFoundException();
    if (p.status === 'PENDING' && p.providerReference && p.provider === this.provider.name) {
      const status = await this.provider.paymentStatus(p.providerReference);
      if (status !== 'PENDING') await this.markResult(p.providerReference, status);
    }
    return this.prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true, kind: true, grossMinor: true } });
  }

  /** The customer left the payment page without paying: close it so it can no longer be paid. */
  async cancelPending(user: AuthUser, paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { job: true } });
    if (!p || p.job.customerId !== user.id) throw new NotFoundException();
    if (p.status !== 'PENDING' || !p.providerReference) return { id: p.id, status: p.status };
    if ((await this.provider.paymentStatus(p.providerReference)) === 'SUCCEEDED') await this.markResult(p.providerReference, 'SUCCEEDED');
    else {
      await this.provider.cancelIntent(p.providerReference).catch(() => undefined);
      await this.prisma.payment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    }
    return this.prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true } });
  }

  async webhook(raw: Buffer, signature?: string) {
    const ev = this.provider.parseWebhook(raw, signature);
    if (!ev) throw new BadRequestException('Invalid webhook');
    if (ev.kind === 'payment') await this.markResult(ev.reference, ev.status);
    if (ev.kind === 'payee') await this.updatePayee(ev.accountRef, ev);
    if (ev.kind === 'subscription_checkout') await this.subscriptions.onProviderCheckout(ev.reference, ev.subscriptionRef, ev.localId);
    if (ev.kind === 'subscription') await this.subscriptions.onProviderUpdate(ev.subscription);
    if (ev.kind === 'subscription_payment_failed') await this.subscriptions.onProviderPaymentFailed(ev.subscriptionRef);
    return { received: true };
  }

  // ── Payouts through the provider (Stripe Connect) ──

  private async updatePayee(accountRef: string, st: { payoutsEnabled: boolean; detailsSubmitted: boolean }) {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { providerAccountId: accountRef } });
    if (!pro) return;
    await this.prisma.professionalProfile.update({ where: { id: pro.id }, data: { providerPayoutsEnabled: st.payoutsEnabled, providerDetailsSubmitted: st.detailsSubmitted, providerAccountUpdatedAt: new Date() } });
    if (st.payoutsEnabled && !pro.providerPayoutsEnabled) {
      await this.audit.log({ action: 'payout_provider.enabled', entityType: 'ProfessionalProfile', entityId: pro.id, metadata: { accountRef } });
      await this.notifications.notify({ userId: pro.userId, type: 'PAYMENT_COMPLETED', title: 'Payouts are active', body: 'Money customers pay through UNRET is now sent to your bank account.', data: { url: '/pro/earnings' } });
      await this.payouts.releaseWaiting(pro.id);
    }
  }

  /** Payout setup for the professional: which provider, and whether their account there is ready. */
  async payoutStatus(user: AuthUser) {
    const pid = requirePro(user);
    let pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: pid } });
    if (this.provider.usesPayeeAccounts && pro.providerAccountId && !pro.providerPayoutsEnabled && this.provider.payeeStatus) {
      try {
        await this.updatePayee(pro.providerAccountId, await this.provider.payeeStatus(pro.providerAccountId));
        pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: pid } });
      } catch (e) {
        // The provider may be unreachable; show the last known status.
      }
    }
    const held = await this.prisma.payment.aggregate({ where: { job: { professionalId: pid }, method: 'PLATFORM', payoutStatus: 'HELD', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, _sum: { payoutMinor: true } });
    return {
      provider: this.provider.name,
      connect: this.provider.usesPayeeAccounts
        ? { status: pro.providerPayoutsEnabled ? 'active' : pro.providerAccountId ? 'incomplete' : 'not_started', detailsSubmitted: pro.providerDetailsSubmitted, payoutsEnabled: pro.providerPayoutsEnabled }
        : null,
      heldMinor: held._sum.payoutMinor ?? 0,
    };
  }

  /** Creates the professional's account at the provider (once) and returns the provider's onboarding page. */
  async startPayoutOnboarding(user: AuthUser, returnUrl?: string) {
    const pid = requirePro(user);
    if (!this.provider.usesPayeeAccounts || !this.provider.createPayeeAccount || !this.provider.payeeOnboardingUrl) throw new BadRequestException('Payouts are sent to your IBAN; add it on this page.');
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: pid }, include: { user: { select: { email: true } } } });
    let accountRef = pro.providerAccountId;
    if (!accountRef) {
      if (!pro.user.email) throw new BadRequestException('Add an email address to your account first');
      const country = (await this.prisma.user.findUnique({ where: { id: user.id }, select: { countryCode: true } }))?.countryCode ?? 'RO';
      accountRef = await this.provider.createPayeeAccount({ email: pro.user.email, country, businessType: pro.accountType === 'COMPANY' ? 'company' : 'individual', professionalId: pid });
      await this.prisma.professionalProfile.update({ where: { id: pid }, data: { providerAccountId: accountRef, providerAccountUpdatedAt: new Date() } });
      await this.audit.log({ actorId: user.id, action: 'payout_provider.account_created', entityType: 'ProfessionalProfile', entityId: pid, metadata: { accountRef } });
    }
    const back = this.safeReturnUrl(returnUrl, '/pro/earnings');
    return { url: await this.provider.payeeOnboardingUrl(accountRef, back, back) };
  }

  /** The provider's dashboard where the professional sees their payouts and changes their bank account. */
  async payoutDashboard(user: AuthUser) {
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: requirePro(user) } });
    if (!pro.providerAccountId || !this.provider.payeeDashboardUrl) throw new BadRequestException('Set up payouts first');
    return { url: await this.provider.payeeDashboardUrl(pro.providerAccountId) };
  }

  async refund(admin: AuthUser, paymentId: string, dto: RefundDto) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.method !== 'PLATFORM' || !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)) throw new BadRequestException('Payment cannot be refunded');
    if (p.refundedMinor + dto.amountMinor > p.grossMinor) throw new BadRequestException('Refund exceeds the amount paid');
    await this.provider.refund(p.providerReference!, dto.amountMinor);
    const refunded = p.refundedMinor + dto.amountMinor;
    const full = refunded === p.grossMinor;
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { refundedMinor: refunded, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED', ...(full && p.payoutStatus === 'HELD' ? { payoutStatus: 'REFUNDED' } : {}) } });
    await this.audit.log({ actorId: admin.id, action: 'admin.payment.refund', entityType: 'Payment', entityId: paymentId, metadata: { ...dto } });
    return updated;
  }

  /** Customer payment history and professional earnings. */
  async history(user: AuthUser, as: 'customer' | 'professional', q: PageQuery) {
    const where = as === 'customer' ? { job: { customerId: user.id } } : { job: { professionalId: user.professionalId ?? '-' } };
    const settled = { status: { in: ['SUCCEEDED', 'RECORDED', 'CONFIRMED', 'PARTIALLY_REFUNDED'] as any } };
    const [rows, total, sums] = await Promise.all([
      this.prisma.payment.findMany({ where: { ...where, status: { not: 'FAILED' } }, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { job: { select: { id: true, request: { select: { title: true } } } } } }),
      this.prisma.payment.count({ where: { ...where, status: { not: 'FAILED' } } }),
      this.prisma.payment.groupBy({ by: ['currency', 'method'], where: { ...where, ...settled }, _sum: { grossMinor: true, payoutMinor: true, platformFeeMinor: true, refundedMinor: true } }),
    ]);
    return { ...pageResult(rows, total, q), totals: sums };
  }

  async adminList(q: PageQuery & { status?: string }) {
    const where = q.status ? { status: q.status as any } : {};
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { job: { select: { id: true, request: { select: { title: true } }, customer: { select: { name: true } } } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @ApiBearerAuth()
  @Get()
  history(@CurrentUser() user: AuthUser, @Query('as') as: 'customer' | 'professional' = 'customer', @Query() q: PageQuery) {
    return this.payments.history(user, as, q);
  }

  @ApiBearerAuth()
  @Get('payouts/status')
  payoutStatus(@CurrentUser() user: AuthUser) {
    return this.payments.payoutStatus(user);
  }

  @ApiBearerAuth()
  @Post('payouts/onboard')
  startPayoutOnboarding(@CurrentUser() user: AuthUser, @Body() dto: ReturnUrlDto) {
    return this.payments.startPayoutOnboarding(user, dto?.returnUrl);
  }

  @ApiBearerAuth()
  @Post('payouts/dashboard')
  payoutDashboard(@CurrentUser() user: AuthUser) {
    return this.payments.payoutDashboard(user);
  }

  @ApiBearerAuth()
  @Post(':id/cancel')
  cancelPending(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.cancelPending(user, id);
  }

  @ApiBearerAuth()
  @Post(':id/sync')
  sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.sync(user, id);
  }

  @ApiBearerAuth()
  @Get('payout-account')
  payoutAccount(@CurrentUser() user: AuthUser) {
    return this.payments.getPayoutAccount(user);
  }

  @ApiBearerAuth()
  @Put('payout-account')
  setPayoutAccount(@CurrentUser() user: AuthUser, @Body() dto: PayoutAccountDto, @ClientIp() ip: string) {
    return this.payments.setPayoutAccount(user, dto, ip);
  }

  @ApiBearerAuth()
  @Delete('payout-account')
  removePayoutAccount(@CurrentUser() user: AuthUser) {
    return this.payments.removePayoutAccount(user);
  }

  @ApiBearerAuth()
  @Patch('jobs/:jobId/method')
  setMethod(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: MethodDto) {
    return this.payments.setMethod(user, jobId, dto.method);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: MarkPaidDto) {
    return this.payments.markPaid(user, jobId, dto);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: ConfirmDto) {
    return this.payments.confirmReceived(user, jobId, dto);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/checkout')
  checkout(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: PartDto) {
    return this.payments.createPlatformPayment(user, jobId, dto?.part, dto?.returnUrl);
  }

  @ApiBearerAuth()
  @Post(':id/mock-confirm')
  mockConfirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('outcome') outcome: 'succeed' | 'fail' = 'succeed') {
    return this.payments.mockConfirm(user, id, outcome);
  }

  @Public()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') sig?: string) {
    return this.payments.webhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body)), sig);
  }

  @ApiBearerAuth()
  @Permission('payments.view')
  @Get('admin')
  adminList(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.payments.adminList({ ...q, status });
  }

  @ApiBearerAuth()
  @Permission('payments.manage')
  @Post(':id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.payments.refund(user, id, dto);
  }
}

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PayoutsService,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, MockPaymentProvider],
      useFactory: (config: ConfigService, mock: MockPaymentProvider) => {
        const name = config.get('PAYMENT_PROVIDER') ?? 'mock';
        if (name === 'mock') return mock;
        if (name === 'stripe') {
          const key = config.get<string>('STRIPE_SECRET_KEY');
          if (!key) throw new Error('PAYMENT_PROVIDER=stripe needs STRIPE_SECRET_KEY (see docs/payments.md)');
          return new StripePaymentProvider(key, config.get<string>('STRIPE_WEBHOOK_SECRET'), config.get<string>('STRIPE_API_BASE') || undefined);
        }
        throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Use "mock" or "stripe".`);
      },
    },
  ],
  exports: [PayoutsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
