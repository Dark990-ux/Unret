import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MATCH_EXPANSION_DELAY_HOURS, MATCH_MIN_OFFERS } from '@unret/shared';
import { PrismaService } from '../../common/prisma.service';
import { AvailabilityAlertsService } from '../availability/alerts.service';
import { JobsService } from '../jobs/jobs.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupportService } from '../support/support.module';
import { PaymentChecksService } from '../payments/payment-checks.service';

/**
 * Periodic background work. In a multi-instance deployment run these on a single
 * worker instance (SCHEDULER_ENABLED=true only there).
 */
@Injectable()
export class SchedulerService {
  private log = new Logger(SchedulerService.name);
  private enabled = process.env.SCHEDULER_ENABLED !== 'false' && process.env.NODE_ENV !== 'test';

  constructor(private prisma: PrismaService, private matching: MatchingService, private jobs: JobsService, private notifications: NotificationsService, private alerts: AvailabilityAlertsService, private support: SupportService, private paymentChecks: PaymentChecksService) {}

  /** Payment follow-up: reminders after the job's time is over, then the UNRET team checks. */
  @Cron(CronExpression.EVERY_HOUR)
  async paymentFollowUp() {
    if (!this.enabled) return;
    await this.paymentChecks.sweep();
  }

  /** Support: solved problems with no new message for 14 days are closed (they stay in the register). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async closeSolvedTickets() {
    if (!this.enabled) return;
    const n = await this.support.autoClose();
    if (n) this.log.log(`Closed ${n} solved support tickets`);
  }

  /** "Notify me when free": time passing can free a professional (e.g. a fully booked week is over). */
  @Cron(CronExpression.EVERY_HOUR)
  async availabilityAlerts() {
    if (!this.enabled) return;
    await this.alerts.sweep();
  }

  /** Expire requests and offers past their deadlines. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expire() {
    if (!this.enabled) return;
    const now = new Date();
    const reqs = await this.prisma.serviceRequest.updateMany({ where: { status: { in: ['PUBLISHED', 'OFFERS_RECEIVED'] }, expiresAt: { lt: now } }, data: { status: 'EXPIRED' } });
    const offers = await this.prisma.offer.updateMany({
      where: { OR: [{ status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] }, expiresAt: { lt: now } }, { status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] }, request: { status: { in: ['EXPIRED', 'CANCELLED'] } } }] },
      data: { status: 'EXPIRED' },
    });
    if (reqs.count || offers.count) this.log.log(`Expired ${reqs.count} requests, ${offers.count} offers`);
  }

  /** Matching step 9: expand distribution when too few professionals respond. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async expandMatching() {
    if (!this.enabled) return;
    const cutoff = new Date(Date.now() - MATCH_EXPANSION_DELAY_HOURS * 3600e3);
    const candidates = await this.prisma.serviceRequest.findMany({
      where: { status: { in: ['PUBLISHED', 'OFFERS_RECEIVED'] }, targetProfessionalId: null, matches: { some: { notifiedAt: { lt: cutoff } }, none: { notifiedAt: { gte: cutoff } } } },
      include: { _count: { select: { offers: true } } },
      take: 200,
    });
    for (const r of candidates) {
      if (r._count.offers >= MATCH_MIN_OFFERS) continue;
      // Re-evaluate first so newly joined professionals are considered.
      await this.matching.matchAndDistribute(r.id);
      const n = await this.matching.distributeWave(r.id);
      if (n) this.log.log(`Request ${r.id}: expanded to ${n} more professionals (wave ${r.matchWave + 1})`);
    }
  }

  /** Reminders ~24h before appointments. */
  @Cron(CronExpression.EVERY_HOUR)
  async appointmentReminders() {
    if (!this.enabled) return;
    const from = new Date(Date.now() + 23 * 3600e3);
    const to = new Date(Date.now() + 24 * 3600e3);
    const appts = await this.prisma.appointment.findMany({
      where: { status: 'RESERVED', startsAt: { gte: from, lt: to }, job: { status: { in: ['SCHEDULED', 'ACCEPTED'] } } },
      include: { job: { include: { request: { select: { title: true } }, professional: { select: { userId: true } } } } },
    });
    for (const a of appts) {
      if (!a.job) continue;
      for (const uid of [a.job.customerId, a.job.professional.userId])
        await this.notifications.notify({
          userId: uid, type: 'APPOINTMENT_APPROACHING', title: 'Appointment tomorrow',
          body: `"${a.job.request.title}" at ${a.startsAt.toLocaleString('ro-RO', { timeZone: a.timezone, dateStyle: 'medium', timeStyle: 'short' })}`,
          data: { jobId: a.job.id, url: `/jobs/${a.job.id}` },
        });
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoComplete() {
    if (!this.enabled) return;
    const n = await this.jobs.autoComplete();
    if (n) this.log.log(`Auto-completed ${n} jobs`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup() {
    if (!this.enabled) return;
    await this.prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * 864e5) } }] } });
    await this.prisma.professionalSubscription.updateMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: new Date() } }, data: { status: 'EXPIRED' } });
  }
}

@Module({ providers: [SchedulerService], exports: [SchedulerService] })
export class SchedulerModule {}
