import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityService } from './availability.service';

/** How far ahead we look for free time when deciding that a professional "is free". */
const LOOKAHEAD_DAYS = 21;

/**
 * "Notify me when X is free". A customer turns it on for a professional who has no free time
 * (fully booked, outside their availability periods, or not accepting requests). As soon as the
 * professional has a free or partly free working day in the next 3 weeks, everyone waiting is
 * notified once and the alert switches off.
 *
 * Checked right after anything that can free up time (working hours, periods, blocked time,
 * accepting requests, cancelled jobs) and by an hourly sweep for time-based changes.
 */
@Injectable()
export class AvailabilityAlertsService {
  private log = new Logger(AvailabilityAlertsService.name);

  constructor(private prisma: PrismaService, private availability: AvailabilityService, private notifications: NotificationsService) {}

  /** Is the professional free soon? Returns the first free day (YYYY-MM-DD) or null. */
  async nextFree(professionalId: string): Promise<string | null> {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: professionalId }, select: { acceptingRequests: true, visibility: true, timezone: true } });
    if (!pro || pro.visibility === 'HIDDEN' || !pro.acceptingRequests) return null;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: pro.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const cal = await this.availability.calendar(professionalId, today, LOOKAHEAD_DAYS);
    return cal.days.find((d) => d.status === 'free' || d.status === 'partial')?.date ?? null;
  }

  async status(user: AuthUser, professionalId: string) {
    const alert = await this.prisma.availabilityAlert.findUnique({ where: { userId_professionalId: { userId: user.id, professionalId } } });
    return { active: !!alert, nextFree: await this.nextFree(professionalId) };
  }

  /** Turns the alert on. If the professional is already free, nothing is saved and the first free day is returned. */
  async subscribe(user: AuthUser, professionalId: string) {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: professionalId }, select: { userId: true, visibility: true } });
    if (!pro || pro.visibility === 'HIDDEN') throw new NotFoundException('Professional not found');
    if (pro.userId === user.id) throw new BadRequestException('This is your own profile');
    const nextFree = await this.nextFree(professionalId);
    if (nextFree) return { active: false, nextFree };
    await this.prisma.availabilityAlert.upsert({ where: { userId_professionalId: { userId: user.id, professionalId } }, create: { userId: user.id, professionalId }, update: {} });
    return { active: true, nextFree: null };
  }

  async unsubscribe(user: AuthUser, professionalId: string) {
    await this.prisma.availabilityAlert.deleteMany({ where: { userId: user.id, professionalId } });
    return { active: false };
  }

  async mine(user: AuthUser) {
    const rows = await this.prisma.availabilityAlert.findMany({
      where: { userId: user.id }, orderBy: { createdAt: 'desc' },
      include: { professional: { select: { id: true, businessName: true, user: { select: { name: true } } } } },
    });
    return rows.map((r) => ({ professionalId: r.professionalId, name: r.professional.businessName ?? r.professional.user.name, since: r.createdAt }));
  }

  /** Notifies everyone waiting for this professional if they are free now. Never throws. */
  async check(professionalId: string) {
    try {
      const waiting = await this.prisma.availabilityAlert.findMany({ where: { professionalId }, select: { id: true, userId: true } });
      if (!waiting.length) return 0;
      const nextFree = await this.nextFree(professionalId);
      if (!nextFree) return 0;
      const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { businessName: true, user: { select: { name: true } } } });
      const name = pro.businessName ?? pro.user.name;
      const day = new Date(`${nextFree}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
      // Remove first so a parallel check cannot notify twice.
      const { count } = await this.prisma.availabilityAlert.deleteMany({ where: { id: { in: waiting.map((w) => w.id) } } });
      if (!count) return 0;
      for (const w of waiting) {
        await this.notifications.notify({
          userId: w.userId, type: 'AVAILABILITY_OPENED', title: `${name} is available`,
          body: `${name} has free time from ${day}. Send a request before the days are booked.`,
          data: { professionalId, url: `/pros/${professionalId}`, nextFree },
        });
      }
      this.log.log(`Availability alert: ${name} is free from ${nextFree}; notified ${waiting.length}`);
      return waiting.length;
    } catch (e) {
      this.log.error(`Availability alert check failed for ${professionalId}: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Hourly: time passing can free a professional (e.g. a fully booked week is over). */
  async sweep() {
    const pros = await this.prisma.availabilityAlert.findMany({ distinct: ['professionalId'], select: { professionalId: true } });
    let notified = 0;
    for (const p of pros) notified += await this.check(p.professionalId);
    return notified;
  }
}
