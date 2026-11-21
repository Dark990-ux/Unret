import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { decrypt } from '../../common/crypto';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProvider } from './provider';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/**
 * Money paid through UNRET is held, then sent to the professional's IBAN:
 *  - a deposit when the professional starts the work (so they can buy materials),
 *  - everything else when the job is completed.
 * Without a payout account the money stays held and the professional is asked to add one.
 * If the job is cancelled, anything still held is refunded to the customer.
 */
@Injectable()
export class PayoutsService {
  private log = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  private held(where: Prisma.PaymentWhereInput) {
    return this.prisma.payment.findMany({
      where: { ...where, method: 'PLATFORM', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, payoutStatus: 'HELD' },
      include: { job: { include: { professional: { select: { id: true, userId: true } }, request: { select: { title: true } } } } },
    });
  }

  private async send(payments: Awaited<ReturnType<PayoutsService['held']>>, reason: 'deposit' | 'completed') {
    for (const p of payments) {
      const account = await this.prisma.payoutAccount.findUnique({ where: { professionalId: p.job.professional.id } });
      const amount = Math.max(p.payoutMinor - p.refundedMinor, 0);
      if (!account) {
        await this.notifications.notify({
          userId: p.job.professional.userId, type: 'PAYMENT_TO_CONFIRM', title: 'Add your IBAN to receive your money',
          body: `${formatMoney(amount, p.currency)} for "${p.job.request.title}" is waiting for you. Add your payout account (IBAN) to receive it.`,
          data: { jobId: p.jobId, url: '/pro/earnings' },
        });
        continue;
      }
      try {
        const { reference } = await this.provider.payout({ paymentReference: p.providerReference!, amountMinor: amount, currency: p.currency, professionalId: p.job.professional.id, iban: decrypt(account.ibanEncrypted), holderName: account.holderName });
        await this.prisma.payment.update({ where: { id: p.id }, data: { payoutStatus: 'SENT', payoutReference: reference, payoutAt: new Date() } });
        await this.prisma.jobEvent.create({ data: { jobId: p.jobId, type: 'PAYOUT_SENT', note: `${formatMoney(amount, p.currency)}${p.kind === 'DEPOSIT' ? ' · deposit' : ''} → •••• ${account.ibanLast4}` } });
        await this.audit.log({ action: 'payment.payout.sent', entityType: 'Payment', entityId: p.id, metadata: { amount, reference, kind: p.kind, reason } });
        const what = p.kind === 'DEPOSIT' ? 'The deposit' : 'Your payment';
        await this.notifications.notify({ userId: p.job.professional.userId, type: 'PAYMENT_COMPLETED', title: `${what} was sent to your account`, body: `${formatMoney(amount, p.currency)} for "${p.job.request.title}" → IBAN •••• ${account.ibanLast4}.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
        await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: p.kind === 'DEPOSIT' ? 'Deposit released to the professional' : 'Payment released to the professional', body: `UNRET sent your ${p.kind === 'DEPOSIT' ? 'deposit' : 'payment'} for "${p.job.request.title}" to the professional.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
      } catch (e) {
        this.log.error(`Payout for payment ${p.id} failed: ${(e as Error).message}`);
      }
    }
  }

  /** Job completed: release everything still held. */
  async releaseForJob(jobId: string) {
    await this.send(await this.held({ jobId }), 'completed');
  }

  /** Work started: release the deposit (for materials). */
  async releaseDeposit(jobId: string) {
    await this.send(await this.held({ jobId, kind: 'DEPOSIT' }), 'deposit');
  }

  /** A professional just added a payout account: pay out whatever was waiting for it. */
  async releaseWaiting(professionalId: string) {
    await this.send(await this.held({ job: { professionalId, status: 'COMPLETED' } }), 'completed');
    await this.send(await this.held({ job: { professionalId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, kind: 'DEPOSIT' }), 'deposit');
  }

  /** Job cancelled: anything still held goes back to the customer. */
  async refundHeldForJob(jobId: string, reason: string) {
    for (const p of await this.held({ jobId })) {
      const amount = p.grossMinor - p.refundedMinor;
      await this.provider.refund(p.providerReference!, amount);
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', refundedMinor: p.grossMinor, payoutStatus: 'REFUNDED' } });
      await this.prisma.jobEvent.create({ data: { jobId, type: 'PAYMENT_REFUNDED', note: `${formatMoney(amount, p.currency)} · ${reason}` } });
      await this.audit.log({ action: 'payment.refund.auto', entityType: 'Payment', entityId: p.id, metadata: { amount, reason } });
      await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: 'Payment refunded', body: `${formatMoney(amount, p.currency)} for "${p.job.request.title}" was returned to you.`, data: { jobId, url: `/jobs/${jobId}` } });
    }
  }
}
