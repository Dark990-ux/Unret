import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProfileVisibility } from '@prisma/client';
import { CITIES, MATCH_WEIGHTS } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { haversineKm } from '../../common/geo';
import { pageResult } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { CategoriesService } from '../categories/categories.service';
import { StorageService } from '../files/storage.service';
import { OnboardDto, PortfolioDto, SearchQuery, ServiceItemDto, UpdateProfileDto } from './professionals.dto';

export interface Badges {
  identity: boolean;
  business: boolean;
  qualifications: { categoryId: string | null; name: string }[];
  additional: boolean;
}

/** Bayesian-smoothed rating so one 5★ review does not outrank fifty 4.8★ reviews. */
export function smoothedRating(avg: number, count: number, prior = 4.0, weight = 3) {
  return (prior * weight + avg * count) / (weight + count);
}

@Injectable()
export class ProfessionalsService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
    private availability: AvailabilityService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  // ───────── Onboarding & editing ─────────

  async onboard(userId: string, dto: OnboardDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { professional: true, country: true } });
    if (user.professional) throw new ConflictException('You already have a professional profile');
    if (dto.accountType === 'COMPANY' && (!dto.businessName || !dto.registrationNumber))
      throw new BadRequestException('Company accounts require a business name and registration number');
    const other = dto.otherService?.trim();
    if (!dto.categoryIds.length && !other) throw new BadRequestException('Choose at least one service, or describe yours under "Other"');
    for (const id of dto.categoryIds) await this.categories.getForCountry(id, user.countryCode);
    const otherCat = other ? await this.prisma.serviceCategory.findUnique({ where: { slug: 'other' } }) : null;
    const serviceRows = dto.categoryIds.filter((id) => id !== otherCat?.id).map((categoryId) => ({ categoryId, customName: null as string | null }));
    if (other && otherCat) serviceRows.push({ categoryId: otherCat.id, customName: other });

    const pro = await this.prisma.$transaction(async (tx) => {
      let companyId: string | undefined;
      if (dto.accountType === 'COMPANY') {
        const company = await tx.company.create({
          data: {
            ownerUserId: userId, legalName: dto.businessName!, displayName: dto.businessName!,
            registrationCountry: user.countryCode, registrationNumber: dto.registrationNumber!,
            members: { create: { userId, role: 'OWNER' } },
          },
        });
        companyId = company.id;
      }
      const p = await tx.professionalProfile.create({
        data: {
          userId, accountType: dto.accountType, businessName: dto.businessName, city: dto.city,
          baseLat: dto.lat, baseLng: dto.lng, serviceRadiusKm: dto.serviceRadiusKm ?? 25,
          remoteAvailable: dto.remoteAvailable ?? false, countryCode: user.countryCode,
          timezone: user.country.defaultTimezone, languages: [user.preferredLanguage], companyId,
          services: {
            create: serviceRows.map((s, i) => ({ categoryId: s.categoryId, customName: s.customName, currency: user.country.currency, isPrimary: i === 0 })),
          },
        },
      });
      await this.audit.log({ actorId: userId, action: 'professional.onboard', entityType: 'ProfessionalProfile', entityId: p.id, metadata: { accountType: dto.accountType } }, tx);
      return p;
    });
    await this.recomputeVisibility(pro.id);
    return this.getMine(pro.id);
  }

  async update(pid: string, dto: UpdateProfileDto) {
    await this.prisma.professionalProfile.update({ where: { id: pid }, data: dto });
    await this.recomputeVisibility(pid);
    return this.getMine(pid);
  }

  async setServices(pid: string, items: ServiceItemDto[]) {
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: pid }, include: { user: { include: { country: true } } } });
    const ids = new Set<string>();
    for (const s of items) {
      if (ids.has(s.categoryId)) throw new BadRequestException('Duplicate service category');
      ids.add(s.categoryId);
      await this.categories.getForCountry(s.categoryId, pro.countryCode);
    }
    const primaryIdx = Math.max(items.findIndex((s) => s.isPrimary), 0);
    await this.prisma.$transaction([
      this.prisma.professionalService.deleteMany({ where: { professionalId: pid, categoryId: { notIn: [...ids] } } }),
      ...items.map((s, i) =>
        this.prisma.professionalService.upsert({
          where: { professionalId_categoryId: { professionalId: pid, categoryId: s.categoryId } },
          create: { professionalId: pid, categoryId: s.categoryId, description: s.description, pricingType: s.pricingType, indicativePriceMinor: s.indicativePriceMinor, currency: pro.user.country.currency, isPrimary: i === primaryIdx, customName: s.customName?.trim() || null },
          update: { description: s.description, pricingType: s.pricingType, indicativePriceMinor: s.indicativePriceMinor ?? null, isPrimary: i === primaryIdx, customName: s.customName?.trim() || null },
        }),
      ),
    ]);
    await this.recomputeVisibility(pid);
    return this.getMine(pid);
  }

  async addPortfolio(userId: string, pid: string, dto: PortfolioDto) {
    this.storage.assertOwned(dto.fileKey, userId, 'portfolio');
    const count = await this.prisma.portfolioItem.count({ where: { professionalId: pid } });
    if (count >= 50) throw new BadRequestException('Portfolio limit reached (50 items)');
    const item = await this.prisma.portfolioItem.create({ data: { ...dto, professionalId: pid } });
    return { ...item, url: this.storage.signedUrl(item.fileKey) };
  }

  async removePortfolio(pid: string, id: string) {
    const item = await this.prisma.portfolioItem.findFirst({ where: { id, professionalId: pid } });
    if (!item) throw new NotFoundException();
    await this.prisma.portfolioItem.delete({ where: { id } });
    await this.storage.remove(item.fileKey);
    return { ok: true };
  }

  // ───────── Completeness & visibility ─────────

  completeness(p: {
    services: unknown[]; baseLat: number | null; baseLng: number | null; remoteAvailable: boolean;
    headline: string | null; biography: string | null; availabilityRules: unknown[]; user: { avatarKey: string | null };
    portfolio: unknown[];
  }) {
    const checks = [
      { key: 'services', label: 'At least one service', essential: true, done: p.services.length > 0 },
      { key: 'location', label: 'Service location', essential: true, done: (p.baseLat !== null && p.baseLng !== null) || p.remoteAvailable },
      { key: 'headline', label: 'Short headline', essential: false, done: !!p.headline },
      { key: 'biography', label: 'Description of your services and experience', essential: false, done: (p.biography?.length ?? 0) >= 50 },
      { key: 'availability', label: 'Working hours', essential: false, done: p.availabilityRules.length > 0 },
      { key: 'photo', label: 'Profile photo or logo', essential: false, done: !!p.user.avatarKey },
      { key: 'portfolio', label: 'Portfolio photos', essential: false, done: p.portfolio.length > 0, optional: true },
    ];
    const required = checks.filter((c) => !c.optional);
    return { checks, percent: Math.round((checks.filter((c) => c.done).length / checks.length) * 100), essentialsDone: required.filter((c) => c.essential).every((c) => c.done), allDone: required.every((c) => c.done) };
  }

  /**
   * HIDDEN  — essentials missing: not matched, not searchable.
   * LIMITED — essentials present: receives matching requests, not listed in public search.
   * PUBLIC  — full profile (headline, description, working hours, photo): listed in search.
   */
  async recomputeVisibility(pid: string) {
    const p = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: pid },
      include: { services: true, availabilityRules: true, portfolio: { take: 1 }, user: { select: { avatarKey: true, status: true } } },
    });
    const c = this.completeness(p);
    let visibility: ProfileVisibility = c.allDone ? 'PUBLIC' : c.essentialsDone ? 'LIMITED' : 'HIDDEN';
    if (p.user.status !== 'ACTIVE') visibility = 'HIDDEN';
    if (visibility !== p.visibility) await this.prisma.professionalProfile.update({ where: { id: pid }, data: { visibility } });
    return visibility;
  }

  // ───────── Reputation ─────────

  badges(verifications: { type: string; status: string; categoryId: string | null; expiresAt: Date | null; category?: { translations: any[]; slug: string } | null }[], locale = 'ro'): Badges {
    const valid = verifications.filter((v) => v.status === 'APPROVED' && (!v.expiresAt || v.expiresAt > new Date()));
    return {
      identity: valid.some((v) => v.type === 'IDENTITY'),
      business: valid.some((v) => v.type === 'BUSINESS'),
      // A qualification badge is only ever derived from an approved QUALIFICATION record.
      qualifications: valid
        .filter((v) => v.type === 'QUALIFICATION')
        .map((v) => ({ categoryId: v.categoryId, name: v.category ? this.categories.pickName(v.category, locale).name : 'Qualification' })),
      additional: valid.some((v) => v.type === 'ADDITIONAL'),
    };
  }

  /** Recomputes rating, job counters, response time and reliability. */
  async recomputeReputation(pid: string) {
    const [ratings, completed, cancelledByPro, responses] = await Promise.all([
      this.prisma.review.aggregate({ where: { professionalId: pid, status: 'PUBLISHED' }, _avg: { overall: true }, _count: true }),
      this.prisma.job.count({ where: { professionalId: pid, status: 'COMPLETED' } }),
      this.prisma.jobEvent.count({ where: { type: 'CANCELLED_BY_PROFESSIONAL', job: { professionalId: pid } } }),
      this.prisma.$queryRaw<{ avg: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (o."createdAt" - m."notifiedAt")) / 60)::float AS avg
        FROM "Offer" o JOIN "RequestMatch" m ON m."requestId" = o."requestId" AND m."professionalId" = o."professionalId"
        WHERE o."professionalId" = ${pid} AND m."notifiedAt" IS NOT NULL AND o."createdAt" > now() - interval '180 days'`,
    ]);
    const avgResponse = responses[0]?.avg ?? null;
    const completionRate = (completed + 3 * 0.8) / (completed + cancelledByPro + 3);
    const responseFactor = avgResponse === null ? 0.8 : avgResponse <= 60 ? 1 : avgResponse <= 240 ? 0.9 : avgResponse <= 1440 ? 0.75 : 0.6;
    await this.prisma.professionalProfile.update({
      where: { id: pid },
      data: {
        ratingAvg: Math.round((ratings._avg.overall ?? 0) * 100) / 100,
        ratingCount: ratings._count,
        completedJobs: completed,
        cancelledJobs: cancelledByPro,
        avgResponseMinutes: avgResponse === null ? null : Math.round(avgResponse),
        reliabilityScore: Math.round(completionRate * responseFactor * 1000) / 1000,
      },
    });
  }

  // ───────── Reading ─────────

  async getMine(pid: string) {
    const p = await this.prisma.professionalProfile.findUniqueOrThrow({
      where: { id: pid },
      include: {
        services: { include: { category: { include: { translations: true } } }, orderBy: { isPrimary: 'desc' } },
        portfolio: { orderBy: { createdAt: 'desc' } },
        availabilityRules: true,
        verifications: { include: { category: { include: { translations: true } } }, orderBy: { createdAt: 'desc' } },
        company: true,
        user: { select: { name: true, avatarKey: true, preferredLanguage: true } },
      },
    });
    const locale = p.user.preferredLanguage;
    return {
      ...p,
      displayName: p.businessName ?? p.user.name,
      avatarUrl: this.storage.signedUrl(p.user.avatarKey),
      services: p.services.map((s) => ({ ...s, categoryName: s.customName ?? this.categories.pickName(s.category, locale).name, category: undefined })),
      portfolio: p.portfolio.map((i) => ({ ...i, url: this.storage.signedUrl(i.fileKey) })),
      verifications: p.verifications.map((v) => ({ id: v.id, type: v.type, status: v.status, categoryId: v.categoryId, documentName: v.documentName, reviewNote: v.reviewNote, createdAt: v.createdAt, reviewedAt: v.reviewedAt })),
      badges: this.badges(p.verifications, locale),
      completeness: this.completeness(p),
    };
  }

  async publicProfile(id: string, locale: string, viewer?: { id: string; role: string }) {
    const p = await this.prisma.professionalProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, avatarKey: true, status: true } },
        services: { include: { category: { include: { translations: true } } }, orderBy: { isPrimary: 'desc' } },
        portfolio: { orderBy: { createdAt: 'desc' }, take: 30 },
        availabilityRules: { where: { isEmergency: false }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] },
        verifications: { where: { status: 'APPROVED' }, include: { category: { include: { translations: true } } } },
        company: { select: { id: true, displayName: true, logoKey: true } },
        reviews: {
          where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 20,
          include: { customer: { select: { name: true } }, job: { select: { request: { select: { category: { include: { translations: true } } } } } } },
        },
      },
    });
    const isOwnerOrAdmin = viewer && (viewer.role === 'ADMIN' || viewer.id === p?.user.id);
    if (!p || p.user.status !== 'ACTIVE' || (p.visibility === 'HIDDEN' && !isOwnerOrAdmin)) throw new NotFoundException('Professional not found');

    const sub = await this.prisma.review.aggregate({
      where: { professionalId: id, status: 'PUBLISHED' },
      _avg: { communication: true, quality: true, punctuality: true },
    });
    let saved = false;
    if (viewer) saved = !!(await this.prisma.savedProfessional.findUnique({ where: { userId_professionalId: { userId: viewer.id, professionalId: id } } }));

    return {
      id: p.id,
      displayName: p.businessName ?? p.user.name,
      accountType: p.accountType,
      headline: p.headline,
      biography: p.biography,
      experienceYears: p.experienceYears,
      languages: p.languages,
      city: p.city,
      countryCode: p.countryCode,
      serviceRadiusKm: p.serviceRadiusKm,
      remoteAvailable: p.remoteAvailable,
      emergencyAvailable: p.emergencyAvailable,
      acceptingRequests: p.acceptingRequests,
      timezone: p.timezone,
      avatarUrl: this.storage.signedUrl(p.user.avatarKey),
      company: p.company ? { ...p.company, logoUrl: this.storage.signedUrl(p.company.logoKey) } : null,
      services: p.services.map((s) => ({
        categoryId: s.categoryId, categorySlug: s.category.slug, categoryName: s.customName ?? this.categories.pickName(s.category, locale).name, isCustom: !!s.customName,
        description: s.description, pricingType: s.pricingType, indicativePriceMinor: s.indicativePriceMinor, currency: s.currency, isPrimary: s.isPrimary,
      })),
      portfolio: p.portfolio.map((i) => ({ id: i.id, title: i.title, description: i.description, url: this.storage.signedUrl(i.fileKey) })),
      workingHours: p.availabilityRules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      badges: this.badges(p.verifications, locale),
      stats: {
        ratingAvg: p.ratingAvg, ratingCount: p.ratingCount, completedJobs: p.completedJobs, avgResponseMinutes: p.avgResponseMinutes,
        communication: sub._avg.communication, quality: sub._avg.quality, punctuality: sub._avg.punctuality,
        memberSince: p.createdAt,
      },
      reviews: p.reviews.map((r) => ({
        id: r.id, overall: r.overall, communication: r.communication, quality: r.quality, punctuality: r.punctuality,
        text: r.text, isVerifiedJob: r.isVerifiedJob, createdAt: r.createdAt, customerName: shortName(r.customer.name),
        professionalResponse: r.professionalResponse, respondedAt: r.respondedAt,
        serviceName: this.categories.pickName(r.job.request.category, locale).name,
      })),
      saved,
      visibility: isOwnerOrAdmin ? p.visibility : undefined,
    };
  }

  // ───────── Search & discovery (PRD §13) ─────────

  async search(q: SearchQuery, viewerCountry = 'RO') {
    const country = (q.country ?? viewerCountry).toUpperCase();
    const locale = q.locale ?? 'ro';
    let lat = q.lat, lng = q.lng;
    if ((lat === undefined || lng === undefined) && q.city) {
      const c = CITIES.find((x) => x.name.toLowerCase() === q.city!.toLowerCase() && x.countryCode === country);
      if (c) { lat = c.lat; lng = c.lng; }
    }
    const categoryIds = q.category ? await this.resolveCategory(q.category) : null;

    const where: Prisma.ProfessionalProfileWhereInput = {
      countryCode: country,
      visibility: 'PUBLIC',
      user: { status: 'ACTIVE' },
      ...(categoryIds ? { services: { some: { categoryId: { in: categoryIds } } } } : {}),
      ...(q.minRating ? { ratingAvg: { gte: q.minRating } } : {}),
      ...(q.remote === 'true' ? { remoteAvailable: true } : {}),
      ...(q.verified
        ? { verifications: { some: { status: 'APPROVED', type: q.verified.toUpperCase() as any, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { businessName: { contains: q.q, mode: 'insensitive' } },
              { headline: { contains: q.q, mode: 'insensitive' } },
              { biography: { contains: q.q, mode: 'insensitive' } },
              { user: { name: { contains: q.q, mode: 'insensitive' } } },
              { services: { some: { category: { translations: { some: { name: { contains: q.q, mode: 'insensitive' } } } } } } },
              { services: { some: { customName: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const candidates = await this.prisma.professionalProfile.findMany({
      where,
      take: 500,
      include: {
        user: { select: { name: true, avatarKey: true } },
        services: { include: { category: { include: { translations: true } } } },
        verifications: { where: { status: 'APPROVED' }, include: { category: { include: { translations: true } } } },
      },
    });

    type Scored = { p: (typeof candidates)[number]; distanceKm: number | null; relevance: number; location: number; service?: (typeof candidates)[number]['services'][number] };
    const scored: Scored[] = [];
    for (const p of candidates) {
      const service = categoryIds ? p.services.find((s) => categoryIds.includes(s.categoryId)) : p.services.find((s) => s.isPrimary) ?? p.services[0];
      let distanceKm: number | null = null;
      let location = 0.5;
      if (lat !== undefined && lng !== undefined && p.baseLat !== null && p.baseLng !== null) {
        distanceKm = haversineKm(lat, lng, p.baseLat, p.baseLng);
        const onSiteOk = distanceKm <= p.serviceRadiusKm;
        if (!onSiteOk && !(q.remote === 'true' && p.remoteAvailable)) continue;
        location = onSiteOk ? 1 - (distanceKm / Math.max(p.serviceRadiusKm, 1)) * 0.7 : 0.4;
      }
      if (q.maxPriceMinor !== undefined && service?.indicativePriceMinor != null && service.indicativePriceMinor > q.maxPriceMinor) continue;
      const relevance = !categoryIds ? 0.7 : service?.categoryId === categoryIds[0] ? (service.isPrimary ? 1 : 0.85) : 0.7;
      scored.push({ p, distanceKm, relevance, location, service });
    }

    // Availability is the expensive criterion: evaluate it for the best candidates only.
    const pre = (s: Scored) =>
      MATCH_WEIGHTS.serviceRelevance * s.relevance + MATCH_WEIGHTS.location * s.location +
      MATCH_WEIGHTS.reliability * s.p.reliabilityScore + MATCH_WEIGHTS.rating * (smoothedRating(s.p.ratingAvg, s.p.ratingCount) / 5);
    scored.sort((a, b) => pre(b) - pre(a));
    const date = q.availableOn ? new Date(q.availableOn + 'T12:00:00Z') : null;
    const evaluated = scored.slice(0, 120);
    const withAvail: (Scored & { availability: number; score: number })[] = [];
    for (const s of evaluated) {
      const availability = await this.availability.availabilityScore(s.p.id, date, false, s.p.emergencyAvailable);
      if (date && availability < 1) continue;
      withAvail.push({ ...s, availability: s.p.acceptingRequests ? availability : availability * 0.5, score: pre(s) + MATCH_WEIGHTS.availability * availability });
    }
    const sorters: Record<string, (a: (typeof withAvail)[number], b: (typeof withAvail)[number]) => number> = {
      relevance: (a, b) => b.score - a.score,
      rating: (a, b) => smoothedRating(b.p.ratingAvg, b.p.ratingCount) - smoothedRating(a.p.ratingAvg, a.p.ratingCount),
      distance: (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9),
      price: (a, b) => (a.service?.indicativePriceMinor ?? 1e12) - (b.service?.indicativePriceMinor ?? 1e12),
    };
    withAvail.sort(sorters[q.sort ?? 'relevance']);

    const start = (q.page - 1) * q.pageSize;
    const items = withAvail.slice(start, start + q.pageSize).map((s) => ({
      id: s.p.id,
      displayName: s.p.businessName ?? s.p.user.name,
      headline: s.p.headline,
      avatarUrl: this.storage.signedUrl(s.p.user.avatarKey),
      city: s.p.city,
      distanceKm: s.distanceKm === null ? null : Math.round(s.distanceKm * 10) / 10,
      mainService: s.service ? s.service.customName ?? this.categories.pickName(s.service.category, locale).name : null,
      indicativePriceMinor: s.service?.indicativePriceMinor ?? null,
      pricingType: s.service?.pricingType ?? null,
      currency: s.service?.currency ?? null,
      ratingAvg: s.p.ratingAvg,
      ratingCount: s.p.ratingCount,
      completedJobs: s.p.completedJobs,
      remoteAvailable: s.p.remoteAvailable,
      acceptingRequests: s.p.acceptingRequests,
      availability: s.availability >= 1 ? 'available' : s.availability >= 0.6 ? 'this_week' : s.availability > 0.3 ? 'limited' : 'unknown',
      badges: this.badges(s.p.verifications, locale),
      score: Math.round(s.score * 1000) / 1000,
    }));
    return pageResult(items, withAvail.length, q);
  }

  private async resolveCategory(idOrSlug: string) {
    const cat = await this.prisma.serviceCategory.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
    if (!cat) return [];
    return this.categories.descendantIds(cat.id);
  }

  assertOwner(pid: string | null | undefined, target: string) {
    if (pid !== target) throw new ForbiddenException();
  }
}

export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}
