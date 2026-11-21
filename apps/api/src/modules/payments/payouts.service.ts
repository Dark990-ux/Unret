import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProvider } from './provider';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

/**
 * Money paid through UNRET is held until the job is completed, then sent to the professional
 * (minus fees). If the job is cancelled instead, the customer is refunded.
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

  private held(jobId: string) {
    return this.prisma.payment.findMany({
      where: { jobId, method: 'PLATFORM', status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] }, payoutStatus: 'HELD' },
      include: { job: { include: { professional: { select: { id: true, userId: true } }, request: { select: { title: true } } } } },
    });
  }

  /** Called when a job becomes COMPLETED. */
  async releaseForJob(jobId: string) {
    for (const p of await this.held(jobId)) {
      try {
        const amount = p.payoutMinor - Math.max(0, p.refundedMinor);
        const { reference } = await this.provider.payout({ paymentReference: p.providerReference!, amountMinor: amount, currency: p.currency, professionalId: p.job.professional.id });
        await this.prisma.payment.update({ where: { id: p.id }, data: { payoutStatus: 'SENT', payoutReference: reference, payoutAt: new Date() } });
        await this.prisma.jobEvent.create({ data: { jobId, type: 'PAYOUT_SENT', note: formatMoney(amount, p.currency) } });
        await this.audit.log({ action: 'payment.payout.sent', entityType: 'Payment', entityId: p.id, metadata: { amount, reference } });
        await this.notifications.notify({ userId: p.job.professional.userId, type: 'PAYMENT_COMPLETED', title: 'Payment sent to you', body: `${formatMoney(amount, p.currency)} for "${p.job.request.title}" is on its way to your account.`, data: { jobId, url: `/jobs/${jobId}` } });
        await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: 'Payment released to the professional', body: `UNRET sent your payment for "${p.job.request.title}" to the professional.`, data: { jobId, url: `/jobs/${jobId}` } });
      } catch (e) {
        this.log.error(`Payout for payment ${p.id} failed: ${(e as Error).message}`);
      }
    }
  }

  /** Called when a job is cancelled: anything still held goes back to the customer. */
  async refundHeldForJob(jobId: string, reason: string) {
    for (const p of await this.held(jobId)) {
      const amount = p.grossMinor - p.refundedMinor;
      await this.provider.refund(p.providerReference!, amount);
      await this.prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', refundedMinor: p.grossMinor, payoutStatus: 'REFUNDED' } });
      await this.prisma.jobEvent.create({ data: { jobId, type: 'PAYMENT_REFUNDED', note: `${formatMoney(amount, p.currency)} · ${reason}` } });
      await this.audit.log({ action: 'payment.refund.auto', entityType: 'Payment', entityId: p.id, metadata: { amount, reason } });
      await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: 'Payment refunded', body: `${formatMoney(amount, p.currency)} for "${p.job.request.title}" was returned to you.`, data: { jobId, url: `/jobs/${jobId}` } });
    }
  }
}
