import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MockPaymentProvider, PaymentProvider } from './provider';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

class RecordDirectDto {
  @IsOptional() @IsInt() @Min(0) amountMinor?: number;
  @IsOptional() @IsIn(['cash', 'bank_transfer', 'card_terminal', 'other']) method?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class RefundDto {
  @IsInt() @Min(1) amountMinor: number;
  @IsString() @MaxLength(500) reason: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private jobs: JobsService,
    private notifications: NotificationsService,
    private audit: AuditService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  /** Option A — direct payment: UNRET records the agreed price and method, but does not process or guarantee it. */
  async recordDirect(user: AuthUser, jobId: string, dto: RecordDirectDto) {
    const { job, role } = await this.jobs.access(user, jobId);
    if (role === 'admin') throw new ForbiddenException();
    if (['CANCELLED', 'DISPUTED'].includes(job.status)) throw new BadRequestException('Cannot record a payment for this job');
    const p = await this.prisma.payment.create({
      data: {
        jobId, method: 'DIRECT', grossMinor: dto.amountMinor ?? job.agreedPriceMinor, currency: job.currency, status: 'RECORDED',
        payoutMinor: dto.amountMinor ?? job.agreedPriceMinor, paymentMethodNote: [dto.method, dto.note].filter(Boolean).join(' — ') || null,
      },
    });
    await this.prisma.jobEvent.create({ data: { jobId, actorId: user.id, type: 'PAYMENT_RECORDED', note: `Direct payment recorded by ${role}` } });
    await this.audit.log({ actorId: user.id, action: 'payment.direct.record', entityType: 'Payment', entityId: p.id, metadata: { jobId } });
    return p;
  }

  /** Option B — payment through UNRET via the PSP. Returns a client secret for the PSP's hosted fields / SDK. */
  async createPlatformPayment(user: AuthUser, jobId: string) {
    const { job, role } = await this.jobs.access(user, jobId);
    if (role !== 'customer') throw new ForbiddenException('Only the customer can pay for the job');
    if (['CANCELLED', 'DISPUTED'].includes(job.status)) throw new BadRequestException('This job cannot be paid');
    const paid = await this.prisma.payment.findFirst({ where: { jobId, method: 'PLATFORM', status: { in: ['SUCCEEDED', 'PENDING'] } } });
    if (paid?.status === 'SUCCEEDED') throw new BadRequestException('This job is already paid');
    if (paid) await this.prisma.payment.update({ where: { id: paid.id }, data: { status: 'FAILED' } });

    const country = await this.prisma.user.findUniqueOrThrow({ where: { id: job.customerId }, select: { country: true } });
    const platformFeeMinor = Math.round((job.agreedPriceMinor * country.country.platformFeeBps) / 10000);
    const intent = await this.provider.createIntent({ amountMinor: job.agreedPriceMinor, currency: job.currency, platformFeeMinor, jobId });
    const payment = await this.prisma.payment.create({
      data: {
        jobId, method: 'PLATFORM', provider: this.provider.name, providerReference: intent.reference,
        grossMinor: job.agreedPriceMinor, platformFeeMinor, providerFeeMinor: intent.providerFeeMinor,
        payoutMinor: Math.max(job.agreedPriceMinor - platformFeeMinor - intent.providerFeeMinor, 0),
        currency: job.currency, status: 'PENDING',
      },
    });
    await this.prisma.job.update({ where: { id: jobId }, data: { paymentMethod: 'PLATFORM' } });
    return { paymentId: payment.id, provider: this.provider.name, clientSecret: intent.clientSecret, checkoutUrl: intent.checkoutUrl, amountMinor: payment.grossMinor, currency: payment.currency };
  }

  async markResult(reference: string, status: 'SUCCEEDED' | 'FAILED') {
    const p = await this.prisma.payment.findUnique({ where: { providerReference: reference }, include: { job: { include: { professional: { select: { userId: true } }, request: { select: { title: true } } } } } });
    if (!p || p.status !== 'PENDING') return;
    await this.prisma.payment.update({ where: { id: p.id }, data: { status } });
    await this.audit.log({ action: `payment.${status.toLowerCase()}`, entityType: 'Payment', entityId: p.id, metadata: { reference } });
    if (status === 'SUCCEEDED') {
      await this.prisma.jobEvent.create({ data: { jobId: p.jobId, type: 'PAYMENT_SUCCEEDED', note: formatMoney(p.grossMinor, p.currency) } });
      for (const uid of [p.job.customerId, p.job.professional.userId])
        await this.notifications.notify({ userId: uid, type: 'PAYMENT_COMPLETED', title: 'Payment completed', body: `${formatMoney(p.grossMinor, p.currency)} for "${p.job.request.title}"`, data: { jobId: p.jobId, url: `/jobs/${p.jobId}` } });
    }
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
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { refundedMinor: refunded, status: refunded === p.grossMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    await this.audit.log({ actorId: admin.id, action: 'admin.payment.refund', entityType: 'Payment', entityId: paymentId, metadata: { ...dto } });
    return updated;
  }

  /** Customer payment history and professional earnings. */
  async history(user: AuthUser, as: 'customer' | 'professional', q: PageQuery) {
    const where = as === 'customer' ? { job: { customerId: user.id } } : { job: { professionalId: user.professionalId ?? '-' } };
    const [rows, total, sums] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { job: { select: { id: true, request: { select: { title: true } } } } } }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({ by: ['currency', 'method'], where: { ...where, status: { in: ['SUCCEEDED', 'RECORDED', 'PARTIALLY_REFUNDED'] } }, _sum: { grossMinor: true, payoutMinor: true, platformFeeMinor: true, refundedMinor: true } }),
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
  @Post('jobs/:jobId/direct')
  direct(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string, @Body() dto: RecordDirectDto) {
    return this.payments.recordDirect(user, jobId, dto);
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

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
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
})
export class PaymentsModule {}
