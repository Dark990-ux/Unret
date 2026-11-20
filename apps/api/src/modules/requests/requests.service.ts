import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequestStatus } from '@prisma/client';
import { OPEN_REQUEST_STATUSES } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser } from '../../common/decorators';
import { pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { StorageService } from '../files/storage.service';
import { AvailabilityService } from '../availability/availability.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRequestDto, InboxQuery, ListRequestsQuery, UpdateRequestDto } from './requests.dto';

const REQUEST_TTL_DAYS = 14;

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
    private matching: MatchingService,
    private availability: AvailabilityService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateRequestDto) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { country: true } });
    await this.categories.getForCountry(dto.categoryId, u.countryCode);
    for (const k of dto.attachmentKeys ?? []) this.storage.assertOwned(k, user.id, 'request');
    const { attachmentKeys, publish, preferredDate, preferredDateTo, professionalId, ...rest } = dto;
    if (preferredDate && preferredDateTo && new Date(preferredDateTo) < new Date(preferredDate)) throw new BadRequestException('The end date must be on or after the start date');
    if (professionalId) {
      await this.assertDirectTarget(user, professionalId, dto.categoryId, u.countryCode);
      if (preferredDate) await this.assertPeriodBookable(professionalId, preferredDate, preferredDateTo ?? preferredDate);
    }

    const req = await this.prisma.serviceRequest.create({
      data: {
        ...rest,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        preferredDateTo: preferredDateTo ? new Date(preferredDateTo) : null,
        targetProfessionalId: professionalId ?? null,
        urgency: dto.urgency ?? 'NORMAL',
        customerId: user.id,
        countryCode: u.countryCode,
        currency: u.country.currency,
        attachments: {
          create: (attachmentKeys ?? []).map((fileKey) => ({
            fileKey, fileName: fileKey.split('/').pop()!, mimeType: /\.pdf$/i.test(fileKey) ? 'application/pdf' : 'image',
          })),
        },
      },
    });
    if (publish) return this.publish(user, req.id);
    return this.detail(user, req.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateRequestDto) {
    const req = await this.own(user, id);
    if (req.status !== 'DRAFT') throw new BadRequestException('Only drafts can be edited. Use messages to clarify published requests.');
    if (dto.categoryId) await this.categories.getForCountry(dto.categoryId, req.countryCode);
    await this.prisma.serviceRequest.update({
      where: { id },
      data: { ...dto, preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : undefined, preferredDateTo: dto.preferredDateTo ? new Date(dto.preferredDateTo) : undefined },
    });
    return this.detail(user, id);
  }

  async addAttachment(user: AuthUser, id: string, fileKey: string) {
    const req = await this.own(user, id);
    if (!['DRAFT', ...OPEN_REQUEST_STATUSES].includes(req.status)) throw new BadRequestException('Request is closed');
    this.storage.assertOwned(fileKey, user.id, 'request');
    const count = await this.prisma.requestAttachment.count({ where: { requestId: id } });
    if (count >= 10) throw new BadRequestException('Maximum 10 attachments');
    return this.prisma.requestAttachment.create({
      data: { requestId: id, fileKey, fileName: fileKey.split('/').pop()!, mimeType: /\.pdf$/i.test(fileKey) ? 'application/pdf' : 'image' },
    });
  }

  async publish(user: AuthUser, id: string) {
    const req = await this.own(user, id);
    if (req.status !== 'DRAFT') throw new BadRequestException('Request is already published');
    const { cat } = await this.categories.getForCountry(req.categoryId, req.countryCode);
    if (req.serviceMode === 'REMOTE' && !cat.remoteAllowed) throw new BadRequestException('This service cannot be delivered remotely');
    if (req.serviceMode !== 'REMOTE' && (req.lat === null || req.lng === null)) throw new BadRequestException('A location is required for on-site services');
    if (req.budgetMinMinor != null && req.budgetMaxMinor != null && req.budgetMaxMinor < req.budgetMinMinor)
      throw new BadRequestException('Maximum budget must be greater than minimum');

    const now = new Date();
    const ttl = new Date(now.getTime() + REQUEST_TTL_DAYS * 864e5);
    const lastDay = req.preferredDateTo ?? req.preferredDate;
    const afterPreferred = lastDay ? new Date(lastDay.getTime() + 864e5) : ttl;
    await this.prisma.serviceRequest.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: now, expiresAt: afterPreferred < ttl && afterPreferred > now ? afterPreferred : ttl },
    });
    await this.audit.log({ actorId: user.id, action: 'request.publish', entityType: 'ServiceRequest', entityId: id, metadata: { direct: !!req.targetProfessionalId } });
    if (req.targetProfessionalId) await this.matching.distributeDirect(id, req.targetProfessionalId);
    else await this.matching.enqueue(id);
    return this.detail(user, id);
  }

  async cancel(user: AuthUser, id: string, reason?: string) {
    const req = await this.own(user, id);
    if (!['DRAFT', ...OPEN_REQUEST_STATUSES].includes(req.status))
      throw new BadRequestException(req.status === 'OFFER_ACCEPTED' ? 'An offer was accepted — cancel the job instead' : 'Request is already closed');
    const offers = await this.prisma.offer.findMany({ where: { requestId: id, status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] } }, include: { professional: { select: { userId: true } } } });
    await this.prisma.$transaction([
      this.prisma.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } }),
      this.prisma.offer.updateMany({ where: { requestId: id, status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] } }, data: { status: 'REJECTED', respondedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'request.cancel', entityType: 'ServiceRequest', entityId: id, metadata: { reason } });
    for (const o of offers)
      await this.notifications.notify({ userId: o.professional.userId, type: 'OFFER_REJECTED', title: 'Request cancelled', body: `The customer cancelled "${req.title}".`, data: { requestId: id } });
    return { ok: true };
  }

  async listMine(user: AuthUser, q: ListRequestsQuery) {
    const statusFilter: Record<string, RequestStatus[] | undefined> = {
      active: ['PUBLISHED', 'OFFERS_RECEIVED', 'OFFER_ACCEPTED'],
      draft: ['DRAFT'],
      closed: ['CANCELLED', 'EXPIRED'],
      all: undefined,
    };
    const statuses = statusFilter[q.filter ?? 'all'];
    const where: Prisma.ServiceRequestWhereInput = { customerId: user.id, ...(statuses ? { status: { in: statuses } } : {}) };
    const locale = await this.locale(user.id);
    const [rows, total] = await Promise.all([
      this.prisma.serviceRequest.findMany({
        where, orderBy: { createdAt: 'desc' }, ...paginate(q),
        include: {
          category: { include: { translations: true } },
          offers: { select: { status: true } },
          job: { select: { id: true, status: true } },
          targetProfessional: { select: { businessName: true, user: { select: { name: true } } } },
        },
      }),
      this.prisma.serviceRequest.count({ where }),
    ]);
    return pageResult(
      rows.map((r) => ({
        id: r.id, title: r.title, status: r.status, city: r.city, urgency: r.urgency, createdAt: r.createdAt, publishedAt: r.publishedAt, expiresAt: r.expiresAt,
        preferredDate: r.preferredDate, preferredDateTo: r.preferredDateTo, directTo: r.targetProfessional ? r.targetProfessional.businessName ?? r.targetProfessional.user.name : null,
        categoryName: this.categories.pickName(r.category, locale).name,
        offerCount: r.offers.length, pendingOffers: r.offers.filter((o) => o.status === 'PENDING').length, job: r.job,
      })),
      total, q,
    );
  }

  /** Customer sees everything; a matched professional sees the request without the exact address until hired. */
  async detail(user: AuthUser, id: string) {
    const r = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        category: { include: { translations: true } },
        attachments: true,
        customer: { select: { id: true, name: true, avatarKey: true, createdAt: true } },
        job: { select: { id: true, status: true, professionalId: true } },
        targetProfessional: { select: { id: true, businessName: true, user: { select: { name: true } } } },
        _count: { select: { offers: true } },
      },
    });
    if (!r) throw new NotFoundException('Request not found');
    const locale = await this.locale(user.id);
    const isOwner = r.customerId === user.id;
    const isAdmin = user.role === 'ADMIN';
    let match = null as null | { distanceKm: number | null; viewedAt: Date | null; declinedAt: Date | null; notifiedAt: Date | null };
    let myOffer = null;
    if (!isOwner && !isAdmin) {
      if (!user.professionalId) throw new NotFoundException('Request not found');
      match = await this.prisma.requestMatch.findFirst({ where: { requestId: id, professionalId: user.professionalId, notifiedAt: { not: null } } });
      myOffer = await this.prisma.offer.findFirst({ where: { requestId: id, professionalId: user.professionalId }, include: { revisions: { orderBy: { revision: 'desc' } } } });
      if (!match && !myOffer) throw new NotFoundException('Request not found');
      if (match && !match.viewedAt) await this.prisma.requestMatch.updateMany({ where: { requestId: id, professionalId: user.professionalId }, data: { viewedAt: new Date() } });
    }
    const hired = r.job?.professionalId && r.job.professionalId === user.professionalId;
    const showExact = isOwner || isAdmin || hired;
    return {
      id: r.id, title: r.title, description: r.description, status: r.status, serviceMode: r.serviceMode, urgency: r.urgency,
      categoryId: r.categoryId, categoryName: this.categories.pickName(r.category, locale).name,
      city: r.city, countryCode: r.countryCode,
      addressText: showExact ? r.addressText : null,
      lat: showExact ? r.lat : r.lat !== null ? Math.round(r.lat * 100) / 100 : null,
      lng: showExact ? r.lng : r.lng !== null ? Math.round(r.lng * 100) / 100 : null,
      preferredDate: r.preferredDate, preferredDateTo: r.preferredDateTo, preferredTimeWindow: r.preferredTimeWindow,
      directTo: r.targetProfessional ? { id: r.targetProfessional.id, name: r.targetProfessional.businessName ?? r.targetProfessional.user.name } : null,
      budgetMinMinor: r.budgetMinMinor, budgetMaxMinor: r.budgetMaxMinor, currency: r.currency,
      createdAt: r.createdAt, publishedAt: r.publishedAt, expiresAt: r.expiresAt,
      attachments: r.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, url: this.storage.signedUrl(a.fileKey) })),
      customer: { name: isOwner || hired || isAdmin ? r.customer.name : r.customer.name.split(' ')[0], memberSince: r.customer.createdAt },
      offerCount: r._count.offers,
      job: isOwner || hired || isAdmin ? r.job : null,
      viewer: isOwner ? 'customer' : isAdmin ? 'admin' : 'professional',
      match: match ? { distanceKm: match.distanceKm, declined: !!match.declinedAt } : null,
      myOffer,
    };
  }

  /** Professional inbox of matched requests. */
  async inbox(user: AuthUser, q: InboxQuery) {
    const pid = user.professionalId!;
    const base: Prisma.RequestMatchWhereInput = { professionalId: pid, notifiedAt: { not: null } };
    const filters: Record<string, Prisma.RequestMatchWhereInput> = {
      new: { ...base, declinedAt: null, request: { status: { in: OPEN_REQUEST_STATUSES }, offers: { none: { professionalId: pid } } } },
      offered: { ...base, request: { offers: { some: { professionalId: pid } } } },
      declined: { ...base, declinedAt: { not: null } },
      all: base,
    };
    const where = filters[q.filter ?? 'new'];
    const locale = await this.locale(user.id);
    const [rows, total] = await Promise.all([
      this.prisma.requestMatch.findMany({
        where, orderBy: { notifiedAt: 'desc' }, ...paginate(q),
        include: {
          request: {
            include: {
              category: { include: { translations: true } },
              offers: { where: { professionalId: pid }, select: { id: true, status: true } },
              _count: { select: { offers: true, attachments: true } },
            },
          },
        },
      }),
      this.prisma.requestMatch.count({ where }),
    ]);
    return pageResult(
      rows.map((m) => ({
        requestId: m.requestId, title: m.request.title, description: m.request.description.slice(0, 220),
        categoryName: this.categories.pickName(m.request.category, locale).name, city: m.request.city,
        distanceKm: m.distanceKm === null ? null : Math.round(m.distanceKm), urgency: m.request.urgency, serviceMode: m.request.serviceMode,
        preferredDate: m.request.preferredDate, preferredDateTo: m.request.preferredDateTo, direct: m.request.targetProfessionalId === pid, budgetMinMinor: m.request.budgetMinMinor, budgetMaxMinor: m.request.budgetMaxMinor, currency: m.request.currency,
        status: m.request.status, notifiedAt: m.notifiedAt, viewed: !!m.viewedAt, declined: !!m.declinedAt,
        offerCount: m.request._count.offers, attachmentCount: m.request._count.attachments, myOffer: m.request.offers[0] ?? null,
        expiresAt: m.request.expiresAt,
      })),
      total, q,
    );
  }

  async decline(user: AuthUser, requestId: string) {
    const res = await this.prisma.requestMatch.updateMany({ where: { requestId, professionalId: user.professionalId!, notifiedAt: { not: null } }, data: { declinedAt: new Date() } });
    if (!res.count) throw new NotFoundException();
    return { ok: true };
  }

  /** Admin / owner: explanation of who was matched and why. */
  async matchExplanation(user: AuthUser, id: string) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    return this.prisma.requestMatch.findMany({
      where: { requestId: id },
      orderBy: [{ included: 'desc' }, { score: 'desc' }],
      include: { professional: { select: { id: true, businessName: true, city: true, user: { select: { name: true } } } } },
    });
  }

  /**
   * A period sent from the calendar must start and end on bookable days, and at least half of the
   * working days in it must still be free, so customers don't request a mostly booked period.
   */
  private async assertPeriodBookable(professionalId: string, from: string, to: string) {
    const start = from.slice(0, 10), end = to.slice(0, 10);
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
    if (days > 92) throw new BadRequestException('Please choose a period of at most 3 months');
    const cal = await this.availability.calendar(professionalId, start, days);
    const bookable = (s: string) => s === 'free' || s === 'partial';
    const first = cal.days[0], last = cal.days[cal.days.length - 1];
    if (!first || !last || !bookable(first.status) || !bookable(last.status)) throw new BadRequestException('The start and end days must be days when this professional is available');
    const working = cal.days.filter((d) => d.status !== 'closed' && d.status !== 'past');
    const free = working.filter((d) => bookable(d.status));
    if (free.length * 2 < working.length) throw new BadRequestException('Most of this period is already booked. Please choose other dates.');
  }

  /** A direct request must go to an active professional who offers the service and holds any required verification. */
  private async assertDirectTarget(user: AuthUser, professionalId: string, categoryId: string, countryCode: string) {
    const pro = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      include: {
        user: { select: { id: true, status: true } },
        services: { select: { categoryId: true } },
        verifications: { where: { status: 'APPROVED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { type: true, categoryId: true } },
      },
    });
    if (!pro || pro.user.status !== 'ACTIVE' || pro.visibility === 'HIDDEN') throw new BadRequestException('This professional is not available');
    if (pro.user.id === user.id) throw new BadRequestException('You cannot send a request to yourself');
    if (!pro.acceptingRequests) throw new BadRequestException('This professional is not taking new requests at the moment');
    if (!pro.services.some((s) => s.categoryId === categoryId)) throw new BadRequestException('This professional does not offer the selected service');
    const { required } = await this.categories.getForCountry(categoryId, countryCode);
    const missing = required.filter((type) => !pro.verifications.some((v) => v.type === type && (type !== 'QUALIFICATION' || v.categoryId === null || v.categoryId === categoryId)));
    if (missing.length) throw new BadRequestException('This service requires a verified qualification, which this professional does not have yet');
  }

  private async own(user: AuthUser, id: string) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r || r.customerId !== user.id) throw new NotFoundException('Request not found');
    return r;
  }

  private async locale(userId: string) {
    return (await this.prisma.user.findUnique({ where: { id: userId }, select: { preferredLanguage: true } }))?.preferredLanguage ?? 'ro';
  }
}
