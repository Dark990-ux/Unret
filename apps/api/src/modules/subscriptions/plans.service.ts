import { Injectable } from '@nestjs/common';
import { SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { localParts, zonedToUtc } from '../../common/time';

export interface PlanFeatures {
  /** New requests a professional can receive per day (null = unlimited). Direct requests never count. */
  requestsPerDay: number | null;
  /** 0 (free) … 3 (VIP): how much higher they are shown in search and matching. */
  visibility: number;
  badge: 'standard' | 'deluxe' | 'vip' | null;
  highlights?: string[];
}

/** Extra ranking score per visibility level. Matching/search scores are 0–1, so this moves paid profiles up without overriding relevance or distance. */
export const VISIBILITY_BOOST = [0, 0.04, 0.08, 0.12];

export const features = (p: Pick<SubscriptionPlan, 'features'>): PlanFeatures => {
  const f = (p.features ?? {}) as Partial<PlanFeatures>;
  return { requestsPerDay: f.requestsPerDay === undefined ? 7 : f.requestsPerDay, visibility: f.visibility ?? 0, badge: f.badge ?? null, highlights: f.highlights ?? [] };
};

/** Which plan a professional is on, and how much of today's allowance they used. */
@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  /** The free plan for a country (fallback: any active free plan). */
  async freePlan(countryCode: string) {
    return (
      (await this.prisma.subscriptionPlan.findFirst({ where: { countryCode, isActive: true, priceMinor: 0 }, orderBy: { sortOrder: 'asc' } })) ??
      (await this.prisma.subscriptionPlan.findFirst({ where: { isActive: true, priceMinor: 0 } }))
    );
  }

  /** Current plan: an active (or retrying) paid subscription, otherwise Free. */
  async planFor(professionalId: string) {
    const sub = await this.prisma.professionalSubscription.findFirst({
      where: { professionalId, status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { gt: new Date() } },
      include: { plan: true }, orderBy: { createdAt: 'desc' },
    });
    if (sub) return { plan: sub.plan, features: features(sub.plan), subscription: sub };
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { countryCode: true } });
    const free = await this.freePlan(pro.countryCode);
    return { plan: free, features: free ? features(free) : { requestsPerDay: 7, visibility: 0, badge: null }, subscription: null };
  }

  /** Visibility level for many professionals at once (search, matching). */
  async visibilityMap(professionalIds: string[]): Promise<Map<string, { visibility: number; badge: PlanFeatures['badge'] }>> {
    const subs = await this.prisma.professionalSubscription.findMany({
      where: { professionalId: { in: professionalIds }, status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { gt: new Date() } },
      include: { plan: { select: { features: true } } },
    });
    const m = new Map<string, { visibility: number; badge: PlanFeatures['badge'] }>();
    for (const s of subs) {
      const f = features(s.plan);
      const prev = m.get(s.professionalId);
      if (!prev || f.visibility > prev.visibility) m.set(s.professionalId, { visibility: f.visibility, badge: f.badge });
    }
    return m;
  }

  /** Midnight today in the professional's time zone. */
  private async dayStart(professionalId: string) {
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { timezone: true } });
    const p = localParts(new Date(), pro.timezone);
    return zonedToUtc(p.year, p.month, p.day, 0, 0, pro.timezone);
  }

  /** New (non-direct) requests delivered today, and requests held back by the limit today. */
  async usageToday(professionalId: string) {
    const since = await this.dayStart(professionalId);
    const [row] = await this.prisma.$queryRaw<{ used: bigint; skipped: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "notifiedAt" >= ${since} AND COALESCE(("breakdown"->>'direct')::boolean, false) = false) AS used,
        COUNT(*) FILTER (WHERE "limitSkippedAt" >= ${since} AND "notifiedAt" IS NULL) AS skipped
      FROM "RequestMatch" WHERE "professionalId" = ${professionalId}`;
    return { used: Number(row?.used ?? 0), skipped: Number(row?.skipped ?? 0), since };
  }

  /** Everything the professional's dashboard needs about their plan. */
  async summary(professionalId: string) {
    const { plan, features: f, subscription } = await this.planFor(professionalId);
    const usage = await this.usageToday(professionalId);
    return {
      plan: plan ? { id: plan.id, code: plan.code, name: plan.name, priceMinor: plan.priceMinor, currency: plan.currency } : null,
      requestsPerDay: f.requestsPerDay, visibility: f.visibility, badge: f.badge,
      usedToday: usage.used, missedToday: usage.skipped,
      remainingToday: f.requestsPerDay === null ? null : Math.max(f.requestsPerDay - usage.used, 0),
      subscription: subscription ? { id: subscription.id, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
    };
  }
}
