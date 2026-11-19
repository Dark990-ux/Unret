import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { localParts, parseHm, zonedToUtc } from '../../common/time';

type Tx = Prisma.TransactionClient | PrismaService;
export interface Interval { start: Date; end: Date }

const DAY = 864e5;

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  getRules(professionalId: string) {
    return this.prisma.availabilityRule.findMany({ where: { professionalId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
  }

  async setRules(professionalId: string, rules: { weekday: number; startTime: string; endTime: string; isEmergency?: boolean }[]) {
    for (const r of rules) if (r.endTime <= r.startTime) throw new BadRequestException(`Invalid hours ${r.startTime}-${r.endTime}`);
    // Reject overlapping windows on the same weekday (same kind).
    const byDay = new Map<string, typeof rules>();
    for (const r of rules) {
      const k = `${r.weekday}:${!!r.isEmergency}`;
      byDay.set(k, [...(byDay.get(k) ?? []), r].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    }
    for (const list of byDay.values())
      for (let i = 1; i < list.length; i++)
        if (list[i].startTime < list[i - 1].endTime) throw new BadRequestException('Working hours overlap on the same day');

    await this.prisma.$transaction([
      this.prisma.availabilityRule.deleteMany({ where: { professionalId } }),
      this.prisma.availabilityRule.createMany({ data: rules.map((r) => ({ ...r, isEmergency: !!r.isEmergency, professionalId })) }),
    ]);
    return this.getRules(professionalId);
  }

  listBlocks(professionalId: string) {
    return this.prisma.availabilityBlock.findMany({ where: { professionalId, endsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } });
  }

  addBlock(professionalId: string, startsAt: Date, endsAt: Date, reason?: string) {
    if (endsAt <= startsAt) throw new BadRequestException('End must be after start');
    return this.prisma.availabilityBlock.create({ data: { professionalId, startsAt, endsAt, reason } });
  }

  async removeBlock(professionalId: string, id: string) {
    await this.prisma.availabilityBlock.deleteMany({ where: { id, professionalId } });
    return { ok: true };
  }

  /** Working windows (UTC) generated from weekly rules between `from` and `to`. */
  async workingWindows(professionalId: string, from: Date, to: Date, opts: { includeEmergency?: boolean } = {}): Promise<Interval[]> {
    const pro = await this.prisma.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { timezone: true, availabilityRules: true } });
    const rules = pro.availabilityRules.filter((r) => opts.includeEmergency || !r.isEmergency);
    const out: Interval[] = [];
    for (let t = from.getTime() - DAY; t < to.getTime() + DAY; t += DAY) {
      const p = localParts(new Date(t), pro.timezone);
      for (const r of rules.filter((x) => x.weekday === p.weekday)) {
        const [sh, sm] = parseHm(r.startTime);
        const [eh, em] = parseHm(r.endTime);
        const start = zonedToUtc(p.year, p.month, p.day, sh, sm, pro.timezone);
        const end = zonedToUtc(p.year, p.month, p.day, eh, em, pro.timezone);
        if (end > from && start < to) out.push({ start: new Date(Math.max(+start, +from)), end: new Date(Math.min(+end, +to)) });
      }
    }
    return mergeIntervals(out);
  }

  /** Busy intervals: blocked periods and reserved appointments. */
  async busy(professionalId: string, from: Date, to: Date, tx: Tx = this.prisma): Promise<Interval[]> {
    const [blocks, appts] = await Promise.all([
      tx.availabilityBlock.findMany({ where: { professionalId, startsAt: { lt: to }, endsAt: { gt: from } } }),
      tx.appointment.findMany({ where: { professionalId, status: 'RESERVED', startsAt: { lt: to }, endsAt: { gt: from } } }),
    ]);
    return mergeIntervals([...blocks, ...appts].map((b) => ({ start: b.startsAt, end: b.endsAt })));
  }

  /** Free slots of `durationMin` minutes (30-minute grid) between `from` and `to`. */
  async freeSlots(professionalId: string, from: Date, to: Date, durationMin = 60, limit = 50): Promise<Interval[]> {
    if (to.getTime() - from.getTime() > 31 * DAY) throw new BadRequestException('Range too large (max 31 days)');
    const now = new Date();
    const start = from < now ? now : from;
    const free = subtract(await this.workingWindows(professionalId, start, to), await this.busy(professionalId, start, to));
    const slots: Interval[] = [];
    const step = 30 * 60000;
    const dur = durationMin * 60000;
    for (const w of free) {
      let t = Math.ceil(w.start.getTime() / step) * step;
      while (t + dur <= w.end.getTime() && slots.length < limit) {
        slots.push({ start: new Date(t), end: new Date(t + dur) });
        t += step;
      }
    }
    return slots;
  }

  /**
   * Availability score in [0,1] used by matching and search ranking.
   * 1.0: free time on the preferred day (or within 3 days if none given);
   * 0.6: free within the following week; 0.3: no working hours defined; 0: fully booked/blocked.
   */
  async availabilityScore(professionalId: string, preferredDate: Date | null, emergency: boolean, emergencyAvailable: boolean): Promise<number> {
    if (emergency && emergencyAvailable) return 1;
    const hasRules = await this.prisma.availabilityRule.count({ where: { professionalId } });
    if (!hasRules) return 0.3;
    const base = preferredDate && preferredDate > new Date() ? preferredDate : new Date();
    const dayStart = new Date(base.getTime() - (preferredDate ? 12 * 3600e3 : 0));
    const near = await this.freeSlots(professionalId, dayStart, new Date(dayStart.getTime() + (preferredDate ? 1 : 3) * DAY), 60, 1);
    if (near.length) return 1;
    const week = await this.freeSlots(professionalId, dayStart, new Date(dayStart.getTime() + 8 * DAY), 60, 1);
    return week.length ? 0.6 : 0;
  }

  /** Reserve a slot. The DB exclusion constraint is the final guard against double booking. */
  async reserve(tx: Tx, professionalId: string, jobId: string, startsAt: Date, endsAt: Date) {
    if (endsAt <= startsAt) throw new BadRequestException('Appointment end must be after start');
    const pro = await tx.professionalProfile.findUniqueOrThrow({ where: { id: professionalId }, select: { timezone: true } });
    const blocked = await tx.availabilityBlock.count({ where: { professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
    if (blocked) throw new ConflictException('The professional is unavailable at the proposed time');
    await tx.appointment.updateMany({ where: { jobId, status: 'RESERVED' }, data: { status: 'CANCELLED', jobId: null } });
    try {
      return await tx.appointment.create({ data: { professionalId, jobId, startsAt, endsAt, timezone: pro.timezone } });
    } catch (e: any) {
      if (String(e?.message).includes('appointment_no_overlap') || e?.meta?.code === '23P01')
        throw new ConflictException('This time slot is already booked for the professional');
      throw e;
    }
  }

  async release(tx: Tx, jobId: string) {
    await tx.appointment.updateMany({ where: { jobId, status: 'RESERVED' }, data: { status: 'CANCELLED' } });
  }
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const s = [...list].sort((a, b) => +a.start - +b.start);
  const out: Interval[] = [];
  for (const i of s) {
    const last = out[out.length - 1];
    if (last && +i.start <= +last.end) last.end = new Date(Math.max(+last.end, +i.end));
    else out.push({ start: new Date(i.start), end: new Date(i.end) });
  }
  return out;
}

export function subtract(windows: Interval[], busy: Interval[]): Interval[] {
  let res = windows;
  for (const b of busy) {
    res = res.flatMap((w) => {
      if (+b.end <= +w.start || +b.start >= +w.end) return [w];
      const parts: Interval[] = [];
      if (+b.start > +w.start) parts.push({ start: w.start, end: b.start });
      if (+b.end < +w.end) parts.push({ start: b.end, end: w.end });
      return parts;
    });
  }
  return res;
}
