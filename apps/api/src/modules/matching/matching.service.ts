import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, VerificationType } from '@prisma/client';
import { MATCH_EXPANSION_WAVE, MATCH_INITIAL_WAVE, MATCH_WEIGHTS } from '@unret/shared';
import { haversineKm } from '../../common/geo';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { CategoriesService } from '../categories/categories.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueService } from '../notifications/queue.service';
import { smoothedRating } from '../professionals/professionals.service';
import { PlansService, VISIBILITY_BOOST } from '../subscriptions/plans.service';

interface Evaluation {
  professionalId: string;
  userId: string;
  included: boolean;
  score: number;
  breakdown: Record<string, number | string | boolean | null>;
  exclusionReason?: string;
  distanceKm: number | null;
}

/**
 * Deterministic, explainable matching engine (PRD §20).
 *  1. category → 2. active pros offering it → 3. geographic coverage → 4. availability
 *  → 5. mandatory verification requirements → 6. account status → 7. rank → 8. distribute to a limited
 *  group → 9. expand later if too few offers.
 * Every evaluated professional gets a RequestMatch row with the decision and the reason.
 * Paid plans add a small, disclosed visibility boost to the score and raise the daily number of new requests
 * a professional receives (Free 7, Standard 50, Deluxe 100, VIP unlimited). Requests sent directly to a
 * professional are always delivered and never count towards the limit.
 */
@Injectable()
export class MatchingService implements OnModuleInit {
  private log = new Logger(MatchingService.name);

  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
    private availability: AvailabilityService,
    private notifications: NotificationsService,
    private queue: QueueService,
    private plans: PlansService,
  ) {}

  onModuleInit() {
    this.queue.register('request-matching', (d: { requestId: string }) => this.matchAndDistribute(d.requestId));
  }

  enqueue(requestId: string) {
    return this.queue.add('request-matching', { requestId });
  }

  async evaluate(requestId: string): Promise<Evaluation[]> {
    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    const { cat, required } = await this.categories.getForCountry(req.categoryId, req.countryCode);
    const ancestors = await this.ancestorIds(cat.id);
    const descendants = await this.categories.descendantIds(cat.id);

    const pros = await this.prisma.professionalProfile.findMany({
      where: { countryCode: req.countryCode, services: { some: { categoryId: { in: descendants } } } },
      include: {
        user: { select: { id: true, status: true } },
        services: { where: { categoryId: { in: descendants } } },
        verifications: { where: { status: 'APPROVED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
      },
    });

    const out: Evaluation[] = [];
    for (const p of pros) {
      const exclude = (reason: string, extra: Partial<Evaluation> = {}): void => {
        out.push({ professionalId: p.id, userId: p.user.id, included: false, score: 0, breakdown: {}, exclusionReason: reason, distanceKm: null, ...extra });
      };
      // 6. account status
      if (p.user.id === req.customerId) { exclude('own_request'); continue; }
      if (p.user.status !== 'ACTIVE') { exclude('account_not_active'); continue; }
      if (p.visibility === 'HIDDEN') { exclude('profile_incomplete'); continue; }
      if (!p.acceptingRequests) { exclude('paused_new_requests'); continue; }

      // 2. service relevance
      const exact = p.services.find((s) => s.categoryId === cat.id);
      const relevance = exact ? (exact.isPrimary ? 1 : 0.9) : 0.75;

      // 3. geography
      let distanceKm: number | null = null;
      let location = 0;
      const canRemote = p.remoteAvailable && cat.remoteAllowed;
      if (req.serviceMode === 'REMOTE') {
        if (!canRemote) { exclude('no_remote_service'); continue; }
        location = 1;
      } else {
        if (req.lat !== null && req.lng !== null && p.baseLat !== null && p.baseLng !== null) {
          distanceKm = haversineKm(req.lat, req.lng, p.baseLat, p.baseLng);
          if (distanceKm <= p.serviceRadiusKm) location = 1 - (distanceKm / Math.max(p.serviceRadiusKm, 1)) * 0.8;
          else if (req.serviceMode === 'EITHER' && canRemote) location = 0.5;
          else { exclude('outside_service_area', { distanceKm }); continue; }
        } else if (req.serviceMode === 'EITHER' && canRemote) {
          location = 0.5;
        } else {
          exclude('location_unknown'); continue;
        }
      }

      // 5. mandatory verification requirements (category- and country-specific)
      const missing = required.filter((type: VerificationType) =>
        !p.verifications.some((v) => v.type === type && (type !== 'QUALIFICATION' || v.categoryId === null || ancestors.includes(v.categoryId) || descendants.includes(v.categoryId))),
      );
      if (missing.length) { exclude(`missing_verification:${missing.join(',')}`, { distanceKm }); continue; }

      // 4. availability
      const emergency = req.urgency === 'EMERGENCY';
      const availability = await this.availability.availabilityScore(p.id, req.preferredDate, emergency, p.emergencyAvailable);
      if (availability === 0) { exclude('no_availability', { distanceKm }); continue; }

      // 7. ranking
      const reliability = p.reliabilityScore;
      const rating = smoothedRating(p.ratingAvg, p.ratingCount) / 5;
      const score =
        MATCH_WEIGHTS.serviceRelevance * relevance + MATCH_WEIGHTS.location * location +
        MATCH_WEIGHTS.availability * availability + MATCH_WEIGHTS.reliability * reliability + MATCH_WEIGHTS.rating * rating;
      out.push({
        professionalId: p.id, userId: p.user.id, included: true, distanceKm,
        score: Math.round(score * 10000) / 10000,
        breakdown: {
          serviceRelevance: relevance, location: round(location), availability, reliability: round(reliability), rating: round(rating),
          weights: JSON.stringify(MATCH_WEIGHTS), limitedProfile: p.visibility === 'LIMITED',
        },
      });
    }
    // Paid plans: disclosed visibility boost (shown as "Promoted" to customers).
    const vis = await this.plans.visibilityMap(out.filter((e) => e.included).map((e) => e.professionalId));
    for (const e of out) {
      const v = vis.get(e.professionalId);
      if (!e.included || !v?.visibility) continue;
      e.score = Math.round((e.score + VISIBILITY_BOOST[v.visibility]) * 10000) / 10000;
      e.breakdown = { ...e.breakdown, planBoost: VISIBILITY_BOOST[v.visibility], plan: v.badge };
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Initial distribution (wave 1). Idempotent: re-running does not re-notify. */
  async matchAndDistribute(requestId: string) {
    const req = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!req || !['PUBLISHED', 'OFFERS_RECEIVED'].includes(req.status)) return;
    const evals = await this.evaluate(requestId);
    await this.prisma.$transaction(
      evals.map((e) =>
        this.prisma.requestMatch.upsert({
          where: { requestId_professionalId: { requestId, professionalId: e.professionalId } },
          create: { requestId, professionalId: e.professionalId, included: e.included, score: e.score, breakdown: e.breakdown as Prisma.InputJsonValue, exclusionReason: e.exclusionReason, distanceKm: e.distanceKm },
          update: { included: e.included, score: e.score, breakdown: e.breakdown as Prisma.InputJsonValue, exclusionReason: e.exclusionReason ?? null, distanceKm: e.distanceKm },
        }),
      ),
    );
    if (req.matchWave === 0) await this.distributeWave(requestId, MATCH_INITIAL_WAVE);
    this.log.log(`Request ${requestId}: ${evals.filter((e) => e.included).length}/${evals.length} eligible`);
  }

  /** Notify the next N eligible, not-yet-notified professionals. Returns number notified. */
  async distributeWave(requestId: string, size = MATCH_EXPANSION_WAVE): Promise<number> {
    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { category: { include: { translations: true } } } });
    const candidates = await this.prisma.requestMatch.findMany({
      where: { requestId, included: true, notifiedAt: null },
      orderBy: { score: 'desc' },
      include: { professional: { select: { userId: true, user: { select: { preferredLanguage: true } } } } },
    });
    // Respect each professional's daily allowance; those at their limit are skipped (and can get it in a later wave).
    const next: typeof candidates = [];
    for (const c of candidates) {
      if (next.length >= size) break;
      if (await this.underDailyLimit(c.professionalId, c.id)) next.push(c);
    }
    if (!next.length) return 0;
    const wave = req.matchWave + 1;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.requestMatch.updateMany({ where: { id: { in: next.map((m) => m.id) } }, data: { notifiedAt: now, wave } }),
      this.prisma.serviceRequest.update({ where: { id: requestId }, data: { matchWave: wave } }),
    ]);
    for (const m of next) {
      const catName = this.categories.pickName(req.category, m.professional.user.preferredLanguage).name;
      await this.notifications.notify({
        userId: m.professional.userId,
        type: 'NEW_MATCHING_REQUEST',
        title: `New request: ${req.title}`,
        body: `${catName}${req.city ? ` · ${req.city}` : ''}${m.distanceKm != null ? ` · ${Math.round(m.distanceKm)} km away` : ''}`,
        data: { requestId, url: `/pro/requests/${requestId}` },
      });
    }
    return next.length;
  }

  /** True when the professional can receive one more new request today; otherwise records the miss and tells them (once a day). */
  private async underDailyLimit(professionalId: string, matchId: string) {
    const { features: f, plan } = await this.plans.planFor(professionalId);
    if (f.requestsPerDay === null) return true;
    const usage = await this.plans.usageToday(professionalId);
    if (usage.used < f.requestsPerDay) return true;
    await this.prisma.requestMatch.update({ where: { id: matchId }, data: { limitSkippedAt: new Date() } });
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { userId: true, countryCode: true, planLimitNoticeAt: true } });
    if (!pro.planLimitNoticeAt || pro.planLimitNoticeAt < usage.since) {
      await this.prisma.professionalProfile.update({ where: { id: professionalId }, data: { planLimitNoticeAt: new Date() } });
      const better = await this.prisma.subscriptionPlan.findFirst({ where: { countryCode: pro.countryCode, isActive: true, sortOrder: { gt: plan?.sortOrder ?? 0 } }, orderBy: { sortOrder: 'asc' } });
      const bf = better ? (better.features as { requestsPerDay?: number | null }) : null;
      await this.notifications.notify({
        userId: pro.userId, type: 'PLAN_LIMIT_REACHED',
        title: `You reached today's limit of ${f.requestsPerDay} new requests`,
        body: better
          ? `More customers are looking for your services today. Upgrade to ${better.name} to receive ${bf?.requestsPerDay == null ? 'unlimited requests' : `up to ${bf.requestsPerDay} requests per day`}.`
          : 'More customers are looking for your services today. New requests continue tomorrow.',
        data: { url: '/pro/plans' },
      });
    }
    return false;
  }

  /** A request sent from a professional's calendar goes to that professional only. */
  async distributeDirect(requestId: string, professionalId: string) {
    const req = await this.prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId }, include: { customer: { select: { name: true } } } });
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { userId: true } });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.requestMatch.upsert({
        where: { requestId_professionalId: { requestId, professionalId } },
        create: { requestId, professionalId, included: true, score: 1, breakdown: { direct: true }, wave: 1, notifiedAt: now },
        update: { included: true, notifiedAt: now, wave: 1 },
      }),
      this.prisma.serviceRequest.update({ where: { id: requestId }, data: { matchWave: 1 } }),
    ]);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const period = req.preferredDate ? (req.preferredDateTo && +req.preferredDateTo !== +req.preferredDate ? `${fmt(req.preferredDate)} → ${fmt(req.preferredDateTo)}` : fmt(req.preferredDate)) : null;
    await this.notifications.notify({
      userId: pro.userId,
      type: 'NEW_MATCHING_REQUEST',
      title: `${req.customer.name} sent you a request`,
      body: `${req.title}${period ? ` · ${period}` : ''}`,
      data: { requestId, direct: true, url: `/pro/requests/${requestId}` },
    });
  }

  private async ancestorIds(id: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE t AS (
        SELECT id, "parentId" FROM "ServiceCategory" WHERE id = ${id}
        UNION ALL SELECT c.id, c."parentId" FROM "ServiceCategory" c JOIN t ON t."parentId" = c.id
      ) SELECT id FROM t`;
    return rows.map((r) => r.id);
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;
