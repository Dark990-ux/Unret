import { BadRequestException, Body, Controller, ForbiddenException, Get, Global, Headers, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PAYMENT_PROVIDER, PayoutsService } from './payouts.service';
import { MockPaymentProvider, PaymentProvider } from './provider';

class ConfirmDto {
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class MarkPaidDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class MethodDto {
  @IsEnum(PaymentMethod) method: PaymentMethod;
}
class RefundDto {
  @IsInt() @Min(1) amountMinor: number;
  @IsString() @MaxLength(500) reason: string;
}

const PAYABLE_JOB = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private jobs: JobsService,
    private payouts: PayoutsService,
    private notifications: NotificationsService,
    private audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  private alreadySettled(jobId: string) {
    return this.prisma.payment.findFirst({ where: { jobId, OR: [{ status: { in: ['CONFIRMED', 'RECORDED', 'SUCCEEDED'] } }] } });
  }

  /** Customer changes how they will pay, as long as nothing has been paid yet. */
  async setMethod(user: AuthUser, jobId: string, method: PaymentMethod) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException('Only the customer can change the payment method');
    if (method === 'DIRECT') throw new BadRequestException('Choose card / bank transfer, cash or payment through UNRET');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job can no longer be paid');
    if (await this.alreadySettled(jobId)) throw new BadRequestException('This job is already paid');
    await this.prisma.$transaction([
      this.prisma.job.update({ where: { id: jobId }, data: { paymentMethod: method } }),
      this.prisma.payment.updateMany({ where: { jobId, status: { in: ['AWAITING_CONFIRMATION', 'PENDING'] } }, data: { status: 'FAILED' } }),
      this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_METHOD_CHANGED', note: method } }),
    ]);
    await this.notifications.notify({ userId: otherUserId, type: 'JOB_STATUS_CHANGED', title: 'Payment method changed', body: `The customer will pay for "${job.request.title}" ${({ TRANSFER: 'by card / bank transfer', CASH: 'in cash', PLATFORM: 'through UNRET' } as Record<string, string>)[method]}.`, data: { jobId, url: `/jobs/${jobId}` } });
    return this.jobs.detail(user, jobId);
  }

  /** Card / bank transfer: the customer tells the professional the money was sent. */
  async markPaid(user: AuthUser, jobId: string, dto: MarkPaidDto) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException();
    if (!['TRANSFER', 'CASH', 'DIRECT'].includes(job.paymentMethod)) throw new BadRequestException('This job is paid through UNRET');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job can no longer be paid');
    if (await this.alreadySettled(jobId)) throw new BadRequestException('The professional already confirmed this payment');
    const existing = await this.prisma.payment.findFirst({ where: { jobId, status: 'AWAITING_CONFIRMATION' } });
    if (!existing) {
      await this.prisma.payment.create({
        data: { jobId, method: job.paymentMethod, grossMinor: job.agreedPriceMinor, payoutMinor: job.agreedPriceMinor, currency: job.currency, status: 'AWAITING_CONFIRMATION', customerMarkedPaidAt: new Date(), paymentMethodNote: dto.note || null },
      });
      await this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_MARKED_PAID', note: dto.note } });
    }
    await this.notifications.notify({
      userId: otherUserId, type: 'PAYMENT_TO_CONFIRM', title: 'Please confirm the payment',
      body: `The customer says they paid ${formatMoney(job.agreedPriceMinor, job.currency)} for "${job.request.title}". Confirm in the app once you receive it.`,
      data: { jobId, url: `/jobs/${jobId}` },
    });
    return this.jobs.detail(user, jobId);
  }

  /** Card / bank transfer or cash: only the professional confirms the money arrived. */
  async confirmReceived(user: AuthUser, jobId: string, dto: ConfirmDto) {
    const { job, role, otherUserId } = await this.jobs.access(user, jobId);
    if (role !== 'professional') throw new ForbiddenException('Only the professional can confirm receiving the payment');
    if (job.paymentMethod === 'PLATFORM') throw new BadRequestException('Payments through UNRET are confirmed automatically');
    if (!PAYABLE_JOB.includes(job.status) && job.status !== 'DISPUTED') throw new BadRequestException('This job can no longer be paid');
    if (await this.alreadySettled(jobId)) throw new BadRequestException('This payment is already confirmed');
    const amount = dto.amountMinor ?? job.agreedPriceMinor;
    const now = new Date();
    const awaiting = await this.prisma.payment.findFirst({ where: { jobId, status: 'AWAITING_CONFIRMATION' } });
    const data = { status: 'CONFIRMED' as const, grossMinor: amount, payoutMinor: amount, confirmedById: user.id, confirmedAt: now, payoutStatus: 'NOT_APPLICABLE' as const };
    const p = awaiting
      ? await this.prisma.payment.update({ where: { id: awaiting.id }, data: { ...data, paymentMethodNote: dto.note ?? awaiting.paymentMethodNote } })
      : await this.prisma.payment.create({ data: { ...data, jobId, method: job.paymentMethod, currency: job.currency, paymentMethodNote: dto.note || null } });
    await this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_CONFIRMED', note: `${formatMoney(amount, job.currency)} · ${job.paymentMethod === 'CASH' ? 'cash' : 'transfer'}` } });
    await this.audit.log({ actorId: user.id, action: 'payment.confirm', entityType: 'Payment', entityId: p.id, metadata: { jobId, amount, method: job.paymentMethod } });
    await this.notifications.notify({
      userId: otherUserId, type: 'PAYMENT_COMPLETED', title: 'Payment confirmed',
      body: `The professional confirmed receiving ${formatMoney(amount, job.currency)} for "${job.request.title}".`,
      data: { jobId, url: `/jobs/${jobId}` },
    });
    return this.jobs.detail(user, jobId);
  }

  /** Through UNRET: the customer pays by card; the money is held until the job is completed. */
  async createPlatformPayment(user: AuthUser, jobId: string) {
    const { job, role } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException('Only the customer can pay for the job');
    if (!PAYABLE_JOB.includes(job.status)) throw new BadRequestException('This job cannot be paid');
    if (await this.alreadySettled(jobId)) throw new BadRequestException('This job is already paid');
    await this.prisma.payment.updateMany({ where: { jobId, status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] } }, data: { status: 'FAILED' } });

    const country = await this.prisma.user.findUniqueOrThrow({ where: { id: job.customerId }, select: { country: true } });
    const platformFeeMinor = Math.round((job.agreedPriceMinor * country.country.platformFeeBps) / 10000);
    const intent = await this.provider.createIntent({ amountMinor: job.agreedPriceMinor, currency: job.currency, platformFeeMinor, jobId });
    const payment = await this.prisma.payment.create({
      data: {
        jobId, method: 'PLATFORM', provider: this.provider.name, providerReference: intent.reference,
        grossMinor: job.agreedPriceMinor, platformFeeMinor, providerFeeMinor: intent.providerFeeMinor,
        payoutMinor: Math.max(job.agreedPriceMinor - platformFeeMinor - intent.providerFeeMinor, 0),
        currency: job.currency, status: 'PENDING', payoutStatus: 'HELD',
      },
    });
    if (job.paymentMethod !== 'PLATFORM') await this.prisma.job.update({ where: { id: jobId }, data: { paymentMethod: 'PLATFORM' } });
    return { paymentId: payment.id, provider: this.provider.name, clientSecret: intent.clientSecret, checkoutUrl: intent.checkoutUrl, amountMinor: payment.grossMinor, currency: payment.currency, platformFeeMinor, payoutMinor: payment.payoutMinor };
  }

  async markResult(reference: string, status: 'SUCCEEDED' | 'FAILED') {
    const p = await this.prisma.payment.findUnique({ where: { providerReference: reference }, include: { job: { include: { professional: { select: { userId: true } }, request: { select: { title: true } } } } } });
    if (!p || p.status !== 'PENDING') return;
    await this.prisma.payment.update({ where: { id: p.id }, data: { status } });
    await this.audit.log({ action: `payment.${status.toLowerCase()}`, entityType: 'Payment', entityId: p.id, metadata: { reference } });
    if (status !== 'SUCCEEDED') return;
    await this.prisma.jobEvent.create({ data: { jobId: p.jobId, type: 'PAYMENT_SUCCEEDED', note: formatMoney(p.grossMinor, p.currency) } });
    await this.notifications.notify({ userId: p.job.customerId, type: 'PAYMENT_COMPLETED', title: 'Payment received by UNRET', body: `${formatMoney(p.grossMinor, p.currency)} for "${p.job.request.title}" is held safely and sent to the professional when the job is done.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
    await this.notifications.notify({ userId: p.job.professional.userId, type: 'PAYMENT_COMPLETED', title: 'The customer paid through UNRET', body: `${formatMoney(p.grossMinor, p.currency)} for "${p.job.request.title}" is held by UNRET and sent to you when the job is completed.`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
    if (p.job.status === 'COMPLETED') await this.payouts.releaseForJob(p.jobId);
  }

  async mockConfirm(user: AuthUser, paymentId: string, outcome: 'succeed' | 'fail') {
    if (this.provider.name !== 'mock') throw new NotFoundException();
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { job: true } });
    if (!p || p.job.customerId !== user.id) throw new NotFoundException();
    await this.markResult(p.providerReference!, outcome === 'succeed' ? 'SUCCEEDED' : 'FAILED');
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  async webhook(raw: Buffer, signature?: string) {
    const ev = this.provider.parseWebhook(raw, signature);
    if (!ev) throw new BadRequestException('Invalid webhook');
    await this.markResult(ev.reference, ev.status);
    return { received: true };
  }

  async refund(admin: AuthUser, paymentId: string, dto: RefundDto) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p || p.method !== 'PLATFORM' || !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)) throw new BadRequestException('Payment cannot be refunded');
    if (p.refundedMinor + dto.amountMinor > p.grossMinor) throw new BadRequestException('Refund exceeds the amount paid');
    await this.provider.refund(p.providerReference!, dto.amountMinor);
    const refunded = p.refundedMinor + dto.amountMinor;
    const full = refunded === p.grossMinor;
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { refundedMinor: refunded, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED', ...(full && p.payoutStatus === 'HELD' ? { payoutStatus: 'REFUNDED' } : {}) } });
    await this.audit.log({ actorId: admin.id, action: 'admin.payment.refund', entityType: 'Payment', entityId: paymentId, metadata: { ...dto } });
    return updated;
  }

  /** Customer payment history and professional earnings. */
  async history(user: AuthUser, as: 'customer' | 'professional', q: PageQuery) {
    const where = as === 'customer' ? { job: { customerId: user.id } } : { job: { professionalId: user.professionalId ?? '-' } };
    const settled = { status: { in: ['SUCCEEDED', 'RECORDED', 'CONFIRMED', 'PARTIALLY_REFUNDED'] as any } };
    const [rows, total, sums] = await Promise.all([
      this.prisma.payment.findMany({ where: { ...where, status: { not: 'FAILED' } }, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { job: { select: { id: true, request: { select: { title: true } } } } } }),
      this.prisma.payment.count({ where: { ...where, status: { not: 'FAILED' } } }),
      this.prisma.payment.groupBy({ by: ['currency', 'method'], where: { ...where, ...settled }, _sum: { grossMinor: true, payoutMinor: true, platformFeeMinor: true, refundedMinor: true } }),
    ]);
    return { ...pageResult(rows, total, q), totals: sums };
  }

  async adminList(q: PageQuery & { status?: string }) {
    const where = q.status ? { status: q.status as any } : {};
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { job: { select: { id: true, request: { select: { title: true } }, customer: { select: { name: true } } } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @ApiBearerAuth()
  @Get()
  history(@CurrentUser() user: AuthUser, @Query('as') as: 'customer' | 'professional' = 'customer', @Query() q: PageQuery) {
    return this.payments.history(user, as, q);
  }

  @ApiBearerAuth()
  @Patch('jobs/:jobId/method')
  setMethod(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: MethodDto) {
    return this.payments.setMethod(user, jobId, dto.method);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: MarkPaidDto) {
    return this.payments.markPaid(user, jobId, dto);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/confirm')
  confirm(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: ConfirmDto) {
    return this.payments.confirmReceived(user, jobId, dto);
  }

  @ApiBearerAuth()
  @Post('jobs/:jobId/checkout')
  checkout(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.payments.createPlatformPayment(user, jobId);
  }

  @ApiBearerAuth()
  @Post(':id/mock-confirm')
  mockConfirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body('outcome') outcome: 'succeed' | 'fail' = 'succeed') {
    return this.payments.mockConfirm(user, id, outcome);
  }

  @Public()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Req() req: any, @Headers('stripe-signature') sig?: string) {
    return this.payments.webhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body)), sig);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin')
  adminList(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.payments.adminList({ ...q, status });
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post(':id/refund')
  refund(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundDto) {
    return this.payments.refund(user, id, dto);
  }
}

@Global()
@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PayoutsService,
    MockPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, MockPaymentProvider],
      useFactory: (config: ConfigService, mock: MockPaymentProvider) => {
        const name = config.get('PAYMENT_PROVIDER') ?? 'mock';
        if (name !== 'mock') throw new Error(`Payment provider "${name}" is not configured. Implement PaymentProvider for it in payments/provider.ts`);
        return mock;
      },
    },
  ],
  exports: [PayoutsService],
})
export class PaymentsModule {}
