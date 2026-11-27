import { Injectable, Logger } from '@nestjs/common';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { OPEN_PAYMENT_CHECK, PAYMENT_REMINDER_GRACE_HOURS, PAYMENT_REMINDER_INTERVAL_HOURS, PaymentGap, jobEndsAt, paymentGap, paymentSummary } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SupportService } from '../support/support.module';

const METHOD: Record<string, string> = { TRANSFER: 'card / bank transfer', CASH: 'cash', PLATFORM: 'through UNRET (card in the app)', DIRECT: 'directly' };
/** Reminder texts in the person's language (English and Romanian). */
const TEXT = {
  en: {
    c1: 'The job is over — payment not confirmed', c2: 'Reminder: the payment is still not confirmed',
    p1: 'The job is over — please confirm the payment', p2: 'Reminder: confirm the payment',
    pay: (t: string, a: string) => `"${t}" ended. Please pay ${a} in the app.`,
    markPaid: (t: string, a: string) => `"${t}" ended. If you already paid the professional ${a}, tap "I paid" in the app; if not, please pay now.`,
    confirmNone: (t: string, a: string) => `"${t}" ended and no payment is confirmed yet. When you receive ${a}, confirm it in the app.`,
    confirmMarked: (t: string, a: string) => `The customer says they paid ${a} for "${t}". Please confirm in the app once the money arrived.`,
    again: ' We will remind you again in 24 hours.',
    last: ' This is the last reminder: if nothing changes in 24 hours, the UNRET team will be asked to check.',
    teamTitle: 'The UNRET team will check this payment',
    team: (t: string, n: number) => `Nobody confirmed the payment for "${t}" after two reminders, so the UNRET team will check and may contact you (case #${n}). You can still confirm it in the app at any time.`,
  },
  ro: {
    c1: 'Lucrarea s-a încheiat — plata nu e confirmată', c2: 'Memento: plata încă nu e confirmată',
    p1: 'Lucrarea s-a încheiat — confirmă plata', p2: 'Memento: confirmă plata',
    pay: (t: string, a: string) => `„${t}” s-a încheiat. Te rugăm să plătești ${a} în aplicație.`,
    markPaid: (t: string, a: string) => `„${t}” s-a încheiat. Dacă i-ai plătit deja profesionistului ${a}, apasă „Am plătit” în aplicație; dacă nu, te rugăm să plătești acum.`,
    confirmNone: (t: string, a: string) => `„${t}” s-a încheiat și nicio plată nu e confirmată încă. Când primești ${a}, confirm-o în aplicație.`,
    confirmMarked: (t: string, a: string) => `Clientul spune că a plătit ${a} pentru „${t}”. Te rugăm să confirmi în aplicație după ce primești banii.`,
    again: ' Îți vom aminti din nou peste 24 de ore.',
    last: ' Acesta este ultimul memento: dacă nu se schimbă nimic în 24 de ore, echipa UNRET va fi rugată să verifice.',
    teamTitle: 'Echipa UNRET va verifica această plată',
    team: (t: string, n: number) => `Nimeni nu a confirmat plata pentru „${t}” după două mementouri, așa că echipa UNRET va verifica și te poate contacta (cazul #${n}). Poți confirma plata în aplicație oricând.`,
  },
};
const tx = (lang?: string | null) => (lang === 'ro' ? TEXT.ro : TEXT.en);

/** Jobs that ended longer ago than this are not followed up automatically. */
export const PAYMENT_FOLLOW_UP_MAX_AGE_DAYS = 30;
const fmt = (d: Date | null | undefined) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');

/**
 * Payment follow-up after a job's time is over.
 *
 *   job time over (+1 h) ── reminder 1 ── 24 h ── reminder 2 ── 24 h ── form sent to the UNRET team
 *
 * Only the person who still has to act is reminded (the customer to pay / say they paid, the professional
 * to confirm the money arrived). As soon as the payment is complete the follow-up stops; if the team was
 * already asked, their ticket gets a note and is marked solved.
 */
@Injectable()
export class PaymentChecksService {
  private log = new Logger(PaymentChecksService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private support: SupportService,
    private realtime: RealtimeGateway,
    private audit: AuditService,
  ) {}

  private load(where: object) {
    return this.prisma.job.findMany({
      where,
      take: 500,
      include: {
        request: { select: { title: true } },
        customer: { select: { id: true, name: true, email: true, phone: true, preferredLanguage: true } },
        professional: { select: { userId: true, businessName: true, user: { select: { name: true, email: true, phone: true, preferredLanguage: true } } } },
        payments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  /** Runs every hour. `now` can be moved forward in tests. */
  async sweep(now = new Date()) {
    const h = 3600e3;
    const graceCutoff = new Date(now.getTime() - PAYMENT_REMINDER_GRACE_HOURS * h);
    const step = PAYMENT_REMINDER_INTERVAL_HOURS * h;
    const counts = { reminded1: 0, reminded2: 0, escalated: 0, settled: 0 };

    // Jobs whose time is over (or finished), still in play, and whose follow-up is not finished.
    const jobs = await this.load({
      status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
      paymentCheckResolvedAt: null,
      paymentCheckStage: { lt: 3 },
      OR: [{ completedAt: { lte: graceCutoff } }, { scheduledEndAt: { lte: graceCutoff } }, { scheduledEndAt: null, scheduledStartAt: { lte: new Date(graceCutoff.getTime() - 4 * h) } }],
    });
    for (const j of jobs) {
      const ends = jobEndsAt(j);
      if (!ends || ends > graceCutoff) continue;
      const s = paymentSummary(j.paymentMethod, j.payments, j.agreedPriceMinor, j.depositMinor);
      const gap = paymentGap(j.paymentMethod, s);
      if (!gap) {
        if (j.paymentCheckStage > 0) { await this.settle(j, now); counts.settled++; }
        continue;
      }
      if (j.paymentCheckStage === 0) {
        // Older jobs (e.g. from before this feature) are not chased automatically.
        if (now.getTime() - ends.getTime() > PAYMENT_FOLLOW_UP_MAX_AGE_DAYS * 24 * h) continue;
        await this.remind(j, gap, s.remainingMinor, 1, ends);
        await this.prisma.job.update({ where: { id: j.id }, data: { paymentCheckStage: 1, paymentReminder1At: now } });
        counts.reminded1++;
      } else if (j.paymentCheckStage === 1 && j.paymentReminder1At && now.getTime() - j.paymentReminder1At.getTime() >= step) {
        await this.remind(j, gap, s.remainingMinor, 2, ends);
        await this.prisma.job.update({ where: { id: j.id }, data: { paymentCheckStage: 2, paymentReminder2At: now } });
        counts.reminded2++;
      } else if (j.paymentCheckStage === 2 && j.paymentReminder2At && now.getTime() - j.paymentReminder2At.getTime() >= step) {
        await this.escalate(j, gap, s, ends, now);
        counts.escalated++;
      }
    }

    // Jobs already with the UNRET team: close the case when the payment is finally complete.
    for (const j of await this.load({ ...OPEN_PAYMENT_CHECK, paymentCheckStage: 3 })) {
      if (!paymentGap(j.paymentMethod, paymentSummary(j.paymentMethod, j.payments, j.agreedPriceMinor, j.depositMinor))) { await this.settle(j, now); counts.settled++; }
    }
    if (counts.reminded1 + counts.reminded2 + counts.escalated + counts.settled) this.log.log(`Payment follow-up: ${JSON.stringify(counts)}`);
    return counts;
  }

  /** Called right after a payment is confirmed or completed, so nobody gets a reminder for a job that is already paid. */
  async onPaymentChanged(jobId: string) {
    const [j] = await this.load({ id: jobId, ...OPEN_PAYMENT_CHECK });
    if (j && !paymentGap(j.paymentMethod, paymentSummary(j.paymentMethod, j.payments, j.agreedPriceMinor, j.depositMinor))) await this.settle(j, new Date());
  }

  private async remind(j: Awaited<ReturnType<PaymentChecksService['load']>>[number], gap: PaymentGap, remaining: number, n: 1 | 2, ends: Date) {
    const title = j.request.title;
    const amount = formatMoney(remaining, j.currency);
    const data = { jobId: j.id, url: `/jobs/${j.id}`, reminder: n };
    if (gap.customer) {
      const L = tx(j.customer.preferredLanguage);
      await this.notifications.notify({
        userId: j.customerId, type: 'PAYMENT_REMINDER', title: n === 1 ? L.c1 : L.c2,
        body: (gap.customer === 'pay' ? L.pay(title, amount) : L.markPaid(title, amount)) + (n === 2 ? L.last : L.again), data,
      });
    }
    if (gap.professional) {
      const L = tx(j.professional.user.preferredLanguage);
      await this.notifications.notify({
        userId: j.professional.userId, type: 'PAYMENT_REMINDER', title: n === 1 ? L.p1 : L.p2,
        body: (gap.customer ? L.confirmNone(title, amount) : L.confirmMarked(title, amount)) + (n === 2 ? L.last : L.again), data,
      });
    }
    await this.prisma.jobEvent.create({ data: { jobId: j.id, type: 'PAYMENT_REMINDER', note: `Reminder ${n} · job ended ${fmt(ends)} · waiting for ${[gap.customer && 'customer', gap.professional && 'professional'].filter(Boolean).join(' and ')}` } });
    for (const u of [j.customerId, j.professional.userId]) this.realtime.emitToUser(u, 'job', { jobId: j.id });
  }

  /** Nobody answered the two reminders: fill in the form for the UNRET team and tell both people. */
  private async escalate(j: Awaited<ReturnType<PaymentChecksService['load']>>[number], gap: PaymentGap, s: ReturnType<typeof paymentSummary>, ends: Date, now: Date) {
    const pro = j.professional.businessName ?? j.professional.user.name;
    const marked = j.payments.find((p) => p.status === 'AWAITING_CONFIRMATION');
    const who = [gap.customer && `the customer (${gap.customer === 'pay' ? 'did not pay in the app' : 'did not say they paid'})`, gap.professional && `the professional (${marked ? 'did not confirm receiving the money' : 'did not confirm any payment'})`].filter(Boolean).join(' and ');
    const web = (process.env.PUBLIC_WEB_URL || (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0]).replace(/\/$/, '');
    const form = [
      'PAYMENT NOT CONFIRMED AFTER THE JOB ENDED',
      '',
      `Job:            ${j.request.title}`,
      `Job page:       ${web}/jobs/${j.id}`,
      `Job status:     ${j.status}`,
      `Job ended:      ${fmt(ends)}${j.completedAt ? ' (marked complete)' : ' (end of the scheduled time)'}`,
      '',
      `Customer:       ${j.customer.name} · ${j.customer.email ?? '—'} · ${j.customer.phone ?? '—'}`,
      `Professional:   ${pro} · ${j.professional.user.email ?? '—'} · ${j.professional.user.phone ?? '—'}`,
      '',
      `Payment method: ${METHOD[j.paymentMethod] ?? j.paymentMethod}`,
      `Agreed price:   ${formatMoney(s.totalMinor, j.currency)}${s.depositMinor ? ` (deposit ${formatMoney(s.depositMinor, j.currency)})` : ''}`,
      `Confirmed paid: ${formatMoney(s.paidMinor, j.currency)}`,
      `Still missing:  ${formatMoney(s.remainingMinor, j.currency)}`,
      `Customer said "I paid": ${marked ? `yes, ${formatMoney(marked.grossMinor ?? 0, j.currency)} on ${fmt(marked.customerMarkedPaidAt)}${marked.paymentMethodNote ? ` — "${marked.paymentMethodNote}"` : ''}` : 'no'}`,
      `Failed attempts: ${j.payments.filter((p) => p.status === 'FAILED').length}`,
      '',
      `Reminder 1 sent: ${fmt(j.paymentReminder1At)}`,
      `Reminder 2 sent: ${fmt(j.paymentReminder2At)}`,
      `No answer from:  ${who}`,
      '',
      'Suggested steps: contact both people (phone or message), find out whether the money was paid,',
      'then confirm the payment from the job page, open a dispute, or note the outcome here and mark the ticket solved.',
    ].join('\n');
    const t = await this.support.createAutomatic({ category: 'payments', subject: `Payment not confirmed: ${j.request.title}`, body: form, priority: 'HIGH', jobId: j.id, paymentId: marked?.id });
    await this.prisma.job.update({ where: { id: j.id }, data: { paymentCheckStage: 3, paymentEscalatedAt: now, paymentTicketId: t.id } });
    await this.prisma.jobEvent.create({ data: { jobId: j.id, type: 'PAYMENT_ESCALATED', note: `Sent to the UNRET team · ticket #${t.number}` } });
    await this.audit.log({ actorId: null, action: 'payment.follow_up.escalated', entityType: 'Job', entityId: j.id, metadata: { ticket: t.number, waitingFor: gap } });
    for (const [u, lang] of [[j.customerId, j.customer.preferredLanguage], [j.professional.userId, j.professional.user.preferredLanguage]] as const) {
      const L = tx(lang);
      await this.notifications.notify({ userId: u, type: 'PAYMENT_REMINDER', title: L.teamTitle, body: L.team(j.request.title, t.number), data: { jobId: j.id, url: `/jobs/${j.id}` } });
      this.realtime.emitToUser(u, 'job', { jobId: j.id });
    }
  }

  private async settle(j: Awaited<ReturnType<PaymentChecksService['load']>>[number], now: Date) {
    await this.prisma.job.update({ where: { id: j.id }, data: { paymentCheckResolvedAt: now } });
    await this.prisma.jobEvent.create({ data: { jobId: j.id, type: 'PAYMENT_FOLLOW_UP_CLOSED', note: 'Payment complete' } });
    if (j.paymentTicketId) {
      const last = j.payments.filter((p) => ['CONFIRMED', 'SUCCEEDED'].includes(p.status)).at(-1);
      await this.support.systemNote(j.paymentTicketId, `The payment is now complete${last ? ` (${formatMoney(last.grossMinor ?? 0, j.currency)}, ${last.status === 'CONFIRMED' ? 'confirmed by the professional' : 'paid through UNRET'} on ${fmt(last.confirmedAt ?? last.updatedAt)})` : ''}. Nothing else to do unless someone reports a problem.`, 'Payment confirmed after the reminders.');
    }
  }
}
