import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OPEN_REQUEST_STATUSES, formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { ConversationsService } from '../conversations/conversations.service';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { AcceptOfferDto, CreateOfferDto, OfferTermsDto, ReviseOfferDto } from './offers.dto';

const DEFAULT_OFFER_DAYS = 7;

@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private conversations: ConversationsService,
    private notifications: NotificationsService,
    private availability: AvailabilityService,
    private professionals: ProfessionalsService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  private validateTerms(t: OfferTermsDto) {
    if (t.proposedStartAt && t.proposedEndAt && new Date(t.proposedEndAt) <= new Date(t.proposedStartAt))
      throw new BadRequestException('Appointment end must be after start');
    if (t.proposedStartAt && new Date(t.proposedStartAt) < new Date()) throw new BadRequestException('Proposed appointment is in the past');
    if (t.proposedStartAt && !t.proposedEndAt) throw new BadRequestException('Please give an end time for the proposed appointment');
  }

  private expiry(expiresAt?: string) {
    const max = Date.now() + 60 * 864e5;
    const e = expiresAt ? new Date(expiresAt).getTime() : Date.now() + DEFAULT_OFFER_DAYS * 864e5;
    if (e <= Date.now()) throw new BadRequestException('Offer expiry must be in the future');
    return new Date(Math.min(e, max));
  }

  private revisionData(t: OfferTermsDto, currency: string, createdById: string) {
    return {
      priceMinor: t.priceMinor, currency, priceType: t.priceType, description: t.description,
      materialsIncluded: t.materialsIncluded, materialsNote: t.materialsNote, additionalExpenses: t.additionalExpenses,
      proposedStartAt: t.proposedStartAt ? new Date(t.proposedStartAt) : null,
      proposedEndAt: t.proposedEndAt ? new Date(t.proposedEndAt) : null,
      message: t.message, createdById,
    };
  }

  async create(user: AuthUser, dto: CreateOfferDto) {
    const pid = user.professionalId!;
    this.validateTerms(dto);
    const req = await this.prisma.serviceRequest.findUnique({ where: { id: dto.requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.customerId === user.id) throw new BadRequestException('You cannot quote on your own request');
    if (!OPEN_REQUEST_STATUSES.includes(req.status)) throw new BadRequestException('This request is no longer accepting offers');
    const match = await this.prisma.requestMatch.findFirst({ where: { requestId: req.id, professionalId: pid, notifiedAt: { not: null } } });
    if (!match) throw new ForbiddenException('You can only quote on requests you were matched with');
    if (await this.prisma.offer.findFirst({ where: { requestId: req.id, professionalId: pid } }))
      throw new ConflictException('You already sent an offer for this request — revise it instead');

    const offer = await this.prisma.$transaction(async (tx) => {
      const o = await tx.offer.create({
        data: {
          requestId: req.id, professionalId: pid, expiresAt: this.expiry(dto.expiresAt),
          revisions: { create: { revision: 1, ...this.revisionData(dto, req.currency, user.id) } },
        },
      });
      if (req.status === 'PUBLISHED') await tx.serviceRequest.update({ where: { id: req.id }, data: { status: 'OFFERS_RECEIVED' } });
      const conv = await this.conversations.ensure({ requestId: req.id, customerId: req.customerId, professionalId: pid }, tx);
      await this.conversations.system(conv.id, `Offer sent: ${formatMoney(dto.priceMinor, req.currency)} (${dto.priceType === 'FIXED' ? 'fixed price' : 'estimate'})`, tx);
      if (dto.message) await tx.message.create({ data: { conversationId: conv.id, senderId: user.id, body: dto.message } });
      return o;
    });
    await this.audit.log({ actorId: user.id, action: 'offer.create', entityType: 'Offer', entityId: offer.id, metadata: { requestId: req.id, priceMinor: dto.priceMinor } });
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: pid }, include: { user: { select: { name: true } } } });
    await this.notifications.notify({
      userId: req.customerId, type: 'NEW_OFFER',
      title: `New offer for "${req.title}"`,
      body: `${pro.businessName ?? pro.user.name}: ${formatMoney(dto.priceMinor, req.currency)}`,
      data: { requestId: req.id, offerId: offer.id, url: `/requests/${req.id}` },
    });
    this.professionals.recomputeReputation(pid).catch(() => undefined);
    return this.get(user, offer.id);
  }

  /** Appends a new immutable revision. Original quotation and history are preserved. */
  async revise(user: AuthUser, offerId: string, dto: ReviseOfferDto) {
    this.validateTerms(dto);
    const offer = await this.ownedByPro(user, offerId);
    if (!['PENDING', 'MODIFICATION_REQUESTED'].includes(offer.status)) throw new BadRequestException('This offer can no longer be revised');
    if (!OPEN_REQUEST_STATUSES.includes(offer.request.status)) throw new BadRequestException('Request is closed');
    const next = offer.currentRevision + 1;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.offer.updateMany({
        where: { id: offerId, currentRevision: offer.currentRevision },
        data: { currentRevision: next, status: 'PENDING', expiresAt: dto.expiresAt ? this.expiry(dto.expiresAt) : undefined },
      });
      if (!res.count) throw new ConflictException('The offer was changed concurrently; reload and try again');
      await tx.offerRevision.create({ data: { offerId, revision: next, ...this.revisionData(dto, offer.request.currency, user.id) } });
      const conv = await this.conversations.ensure({ requestId: offer.requestId, customerId: offer.request.customerId, professionalId: offer.professionalId }, tx);
      await this.conversations.system(conv.id, `Offer revised (v${next}): ${formatMoney(dto.priceMinor, offer.request.currency)}`, tx);
    });
    await this.audit.log({ actorId: user.id, action: 'offer.revise', entityType: 'Offer', entityId: offerId, metadata: { revision: next, priceMinor: dto.priceMinor } });
    await this.notifications.notify({
      userId: offer.request.customerId, type: 'OFFER_REVISED', title: 'An offer was updated',
      body: `New price: ${formatMoney(dto.priceMinor, offer.request.currency)} for "${offer.request.title}"`,
      data: { requestId: offer.requestId, offerId, url: `/requests/${offer.requestId}` },
    });
    return this.get(user, offerId);
  }

  async withdraw(user: AuthUser, offerId: string) {
    const offer = await this.ownedByPro(user, offerId);
    if (!['PENDING', 'MODIFICATION_REQUESTED'].includes(offer.status)) throw new BadRequestException('Offer cannot be withdrawn');
    await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'WITHDRAWN' } });
    await this.audit.log({ actorId: user.id, action: 'offer.withdraw', entityType: 'Offer', entityId: offerId });
    return { ok: true };
  }

  /**
   * Accepting an offer creates the job agreement record (PRD §7, §10):
   * the offer is accepted, competing offers are rejected, the request is closed,
   * and — if the offer proposed a time — the slot is reserved (double booking prevented by the DB).
   */
  async accept(user: AuthUser, offerId: string, dto: AcceptOfferDto) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { request: true, revisions: { orderBy: { revision: 'desc' }, take: 1 }, professional: { include: { user: true } } },
    });
    if (!offer || offer.request.customerId !== user.id) throw new NotFoundException('Offer not found');
    if (offer.status !== 'PENDING') throw new BadRequestException('Only pending offers can be accepted');
    if (offer.expiresAt < new Date()) throw new BadRequestException('This offer has expired');
    if (dto.revision !== offer.currentRevision)
      throw new ConflictException('The professional updated this offer. Please review the latest version before accepting.');
    if (offer.professional.user.status !== 'ACTIVE') throw new BadRequestException('This professional is no longer available');
    const rev = offer.revisions[0];

    const job = await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency guards: only one acceptance per request can succeed.
      const reqRes = await tx.serviceRequest.updateMany({
        where: { id: offer.requestId, status: { in: OPEN_REQUEST_STATUSES } },
        data: { status: 'OFFER_ACCEPTED' },
      });
      if (!reqRes.count) throw new ConflictException('An offer has already been accepted for this request');
      const offRes = await tx.offer.updateMany({
        where: { id: offerId, status: 'PENDING', currentRevision: dto.revision },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (!offRes.count) throw new ConflictException('The offer changed; please reload');
      await tx.offer.updateMany({
        where: { requestId: offer.requestId, id: { not: offerId }, status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] } },
        data: { status: 'REJECTED', respondedAt: new Date() },
      });

      const scheduled = !!(rev.proposedStartAt && rev.proposedEndAt);
      const j = await tx.job.create({
        data: {
          requestId: offer.requestId, offerId, acceptedRevisionId: rev.id, customerId: user.id, professionalId: offer.professionalId,
          companyId: offer.professional.companyId, agreedPriceMinor: rev.priceMinor, currency: rev.currency, priceType: rev.priceType,
          scope: rev.description, paymentMethod: dto.paymentMethod ?? offer.request.paymentMethod ?? 'TRANSFER',
          status: scheduled ? 'SCHEDULED' : 'ACCEPTED',
          scheduledStartAt: rev.proposedStartAt, scheduledEndAt: rev.proposedEndAt,
        },
      });
      await tx.jobEvent.create({ data: { jobId: j.id, actorId: user.id, toStatus: 'ACCEPTED', type: 'CREATED', note: `Offer v${rev.revision} accepted` } });
      if (scheduled) {
        await this.availability.reserve(tx, offer.professionalId, j.id, rev.proposedStartAt!, rev.proposedEndAt!);
        await tx.jobEvent.create({ data: { jobId: j.id, actorId: user.id, fromStatus: 'ACCEPTED', toStatus: 'SCHEDULED', type: 'STATUS_CHANGE', note: 'Appointment from offer reserved' } });
      }
      const conv = await this.conversations.ensure({ requestId: offer.requestId, customerId: user.id, professionalId: offer.professionalId, jobId: j.id }, tx);
      await this.conversations.system(conv.id, `Offer accepted — job created (${formatMoney(rev.priceMinor, rev.currency)}).`, tx);
      await this.audit.log({ actorId: user.id, action: 'offer.accept', entityType: 'Offer', entityId: offerId, metadata: { jobId: j.id, revision: rev.revision, priceMinor: rev.priceMinor } }, tx);
      return j;
    });

    await this.notifications.notify({
      userId: offer.professional.userId, type: 'OFFER_ACCEPTED', title: 'Your offer was accepted! 🎉',
      body: `"${offer.request.title}" — ${formatMoney(rev.priceMinor, rev.currency)}`,
      data: { jobId: job.id, url: `/jobs/${job.id}` },
    });
    const rejected = await this.prisma.offer.findMany({
      where: { requestId: offer.requestId, id: { not: offerId }, status: 'REJECTED', respondedAt: { gte: new Date(Date.now() - 60000) } },
      include: { professional: { select: { userId: true } } },
    });
    for (const r of rejected)
      await this.notifications.notify({ userId: r.professional.userId, type: 'OFFER_REJECTED', title: 'Offer not selected', body: `The customer chose another offer for "${offer.request.title}".`, data: { requestId: offer.requestId } });
    return job;
  }

  async reject(user: AuthUser, offerId: string, reason?: string) {
    const offer = await this.ownedByCustomer(user, offerId);
    if (!['PENDING', 'MODIFICATION_REQUESTED'].includes(offer.status)) throw new BadRequestException('Offer cannot be rejected');
    await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'REJECTED', respondedAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'offer.reject', entityType: 'Offer', entityId: offerId, metadata: { reason } });
    await this.notifications.notify({
      userId: offer.professional.userId, type: 'OFFER_REJECTED', title: 'Offer declined',
      body: `Your offer for "${offer.request.title}" was declined.${reason ? ` Reason: ${reason}` : ''}`,
      data: { requestId: offer.requestId },
    });
    return { ok: true };
  }

  async requestModification(user: AuthUser, offerId: string, message: string) {
    const offer = await this.ownedByCustomer(user, offerId);
    if (offer.status !== 'PENDING') throw new BadRequestException('Modification can only be requested on pending offers');
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'MODIFICATION_REQUESTED' } });
      const conv = await this.conversations.ensure({ requestId: offer.requestId, customerId: user.id, professionalId: offer.professionalId }, tx);
      await this.conversations.system(conv.id, 'Customer requested a modification of the offer', tx);
      await tx.message.create({ data: { conversationId: conv.id, senderId: user.id, body: message } });
    });
    await this.notifications.notify({
      userId: offer.professional.userId, type: 'OFFER_MODIFICATION_REQUESTED', title: 'Customer asked for changes',
      body: message.slice(0, 140), data: { requestId: offer.requestId, offerId, url: `/pro/requests/${offer.requestId}` },
    });
    return { ok: true };
  }

  /** Customer view: all offers on a request with pro summary, latest terms and full revision history. */
  async forRequest(user: AuthUser, requestId: string) {
    const req = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!req || (req.customerId !== user.id && user.role !== 'ADMIN')) throw new NotFoundException('Request not found');
    const offers = await this.prisma.offer.findMany({
      where: { requestId, status: { not: 'WITHDRAWN' } },
      orderBy: { createdAt: 'asc' },
      include: {
        revisions: { orderBy: { revision: 'desc' } },
        professional: {
          include: {
            user: { select: { name: true, avatarKey: true } },
            verifications: { where: { status: 'APPROVED' }, include: { category: { include: { translations: true } } } },
          },
        },
      },
    });
    const locale = (await this.prisma.user.findUnique({ where: { id: user.id }, select: { preferredLanguage: true } }))?.preferredLanguage ?? 'ro';
    const now = new Date();
    return Promise.all(
      offers.map(async (o) => {
        const p = o.professional;
        const nextSlots = await this.availability.freeSlots(p.id, now, new Date(now.getTime() + 7 * 864e5), 60, 3).catch(() => []);
        return {
          id: o.id, status: o.status, currentRevision: o.currentRevision, expiresAt: o.expiresAt, createdAt: o.createdAt,
          expired: o.expiresAt < now && o.status === 'PENDING',
          latest: o.revisions[0], revisions: o.revisions,
          professional: {
            id: p.id, displayName: p.businessName ?? p.user.name, headline: p.headline, city: p.city,
            avatarUrl: this.storage.signedUrl(p.user.avatarKey), ratingAvg: p.ratingAvg, ratingCount: p.ratingCount,
            completedJobs: p.completedJobs, avgResponseMinutes: p.avgResponseMinutes, badges: this.professionals.badges(p.verifications, locale),
            nextAvailable: nextSlots.map((s) => s.start),
          },
        };
      }),
    );
  }

  async mine(user: AuthUser, status?: string) {
    const offers = await this.prisma.offer.findMany({
      where: { professionalId: user.professionalId!, ...(status ? { status: status as any } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { revisions: { orderBy: { revision: 'desc' }, take: 1 }, request: { select: { id: true, title: true, city: true, status: true } }, job: { select: { id: true, status: true } } },
    });
    return offers.map((o) => ({ ...o, latest: o.revisions[0], revisions: undefined }));
  }

  async get(user: AuthUser, offerId: string) {
    const o = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { revisions: { orderBy: { revision: 'desc' } }, request: { select: { id: true, title: true, customerId: true, currency: true } }, professional: { select: { userId: true } } },
    });
    if (!o) throw new NotFoundException();
    if (o.request.customerId !== user.id && o.professional.userId !== user.id && user.role !== 'ADMIN') throw new NotFoundException();
    return { ...o, latest: o.revisions[0] };
  }

  private async ownedByPro(user: AuthUser, offerId: string) {
    const o = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { request: true } });
    if (!o || o.professionalId !== user.professionalId) throw new NotFoundException('Offer not found');
    return o;
  }

  private async ownedByCustomer(user: AuthUser, offerId: string) {
    const o = await this.prisma.offer.findUnique({ where: { id: offerId }, include: { request: true, professional: { select: { userId: true } } } });
    if (!o || o.request.customerId !== user.id) throw new NotFoundException('Offer not found');
    return o;
  }
}
