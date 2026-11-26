import { BadRequestException, Body, Controller, Get, Global, Inject, Injectable, Logger, Module, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';
import { formatMoney } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Permission } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PAYMENT_PROVIDER } from '../payments/payouts.service';
import type { PaymentProvider, ProviderSubscription } from '../payments/provider';
import { features, PlansService } from './plans.service';

class PlanDto {
  @Matches(/^[a-z0-9_-]{2,30}$/) code: string;
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(2, 2) countryCode: string;
  @IsInt() @Min(0) priceMinor: number;
  @IsString() @Length(3, 3) currency: string;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
class SubscribeDto {
  @IsOptional() @IsString() @MaxLength(500) returnUrl?: string;
}

const PERIOD_DAYS = 30;

/**
 * Plans for professionals (they pay; customers never do): Free, Standard, Deluxe, VIP.
 * A plan sets the daily number of new requests and a disclosed visibility boost (see PlansService).
 * Billing is monthly through the payment provider (Stripe Billing); with the development provider
 * plans start immediately and renew automatically (simulated payments).
 */
@Injectable()
export class SubscriptionsService {
  private log = new Logger(SubscriptionsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private plansSvc: PlansService,
    private notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  private get billing() {
    return !!(this.provider.ensurePlanPrice && this.provider.createSubscriptionCheckout);
  }

  async plans(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const rows = await this.prisma.subscriptionPlan.findMany({ where: { countryCode: u.countryCode, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { priceMinor: 'asc' }] });
    return rows.map((p) => ({ ...p, providerPriceRef: undefined, features: features(p) }));
  }

  current(user: AuthUser) {
    return this.prisma.professionalSubscription.findFirst({
      where: { professionalId: requirePro(user), status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { gt: new Date() } },
      include: { plan: true }, orderBy: { createdAt: 'desc' },
    });
  }

  async summary(user: AuthUser) {
    return { ...(await this.plansSvc.summary(requirePro(user))), billing: this.billing ? this.provider.name : 'simulated' };
  }

  private safeReturnUrl(url: string | undefined) {
    const origins = [...(process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','), ...(process.env.APP_ORIGINS ?? '').split(',')].map((o) => o.trim()).filter(Boolean);
    const fallback = `${origins[0]}/pro/plans`;
    if (!url) return fallback;
    if (url.startsWith('unret://')) return url;
    try { return origins.some((o) => new URL(o).origin === new URL(url).origin) ? url : fallback; } catch { return fallback; }
  }

  private async priceRef(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { id: planId } });
    if (plan.providerPriceRef) return plan.providerPriceRef;
    const ref = await this.provider.ensurePlanPrice!(plan);
    await this.prisma.subscriptionPlan.update({ where: { id: planId }, data: { providerPriceRef: ref } });
    return ref;
  }

  /** Choose a plan. Free = cancel the paid plan at the end of the month. Paid = checkout, or switch plan right away. */
  async subscribe(user: AuthUser, planId: string, returnUrl?: string) {
    const pid = requirePro(user);
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { countryCode: true, email: true } });
    if (!plan?.isActive || plan.countryCode !== me.countryCode) throw new BadRequestException('Plan not available');
    const active = await this.current(user);

    if (plan.priceMinor === 0) {
      if (active) await this.cancel(user);
      return { status: 'free', ...(await this.summary(user)) };
    }
    if (active?.planId === plan.id) {
      if (active.cancelAtPeriodEnd) await this.resume(user);
      return { status: 'unchanged', ...(await this.summary(user)) };
    }

    // Switch between paid plans: same subscription, new price (difference settled by the provider).
    if (active && active.provider && active.provider === this.provider.name && active.providerRef && this.provider.changeSubscriptionPrice) {
      const s = await this.provider.changeSubscriptionPrice(active.providerRef, await this.priceRef(plan.id));
      await this.prisma.professionalSubscription.update({ where: { id: active.id }, data: { planId: plan.id, status: s.status === 'PENDING' ? 'ACTIVE' : s.status, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: false } });
      await this.audit.log({ actorId: user.id, action: 'subscription.change', entityType: 'ProfessionalSubscription', entityId: active.id, metadata: { from: active.plan.code, to: plan.code } });
      await this.notifyChange(pid, `You are now on ${plan.name}`, this.describe(plan));
      return { status: 'changed', ...(await this.summary(user)) };
    }

    if (!this.billing) {
      // Development: no real billing. Start right away, renew monthly (simulated payment).
      if (active) await this.prisma.professionalSubscription.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
      const sub = await this.prisma.professionalSubscription.create({ data: { professionalId: pid, planId: plan.id, status: 'ACTIVE', provider: 'simulated', currentPeriodEnd: new Date(Date.now() + PERIOD_DAYS * 864e5) } });
      await this.audit.log({ actorId: user.id, action: 'subscription.start', entityType: 'ProfessionalSubscription', entityId: sub.id, metadata: { plan: plan.code, simulated: true } });
      await this.notifyChange(pid, `You are now on ${plan.name}`, this.describe(plan));
      return { status: 'active', simulated: true, ...(await this.summary(user)) };
    }

    // Real billing: the professional pays on the provider's page; the plan starts when the payment succeeds.
    await this.prisma.professionalSubscription.updateMany({ where: { professionalId: pid, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    const pending = await this.prisma.professionalSubscription.create({ data: { professionalId: pid, planId: plan.id, status: 'PENDING', provider: this.provider.name, currentPeriodEnd: new Date() } });
    const co = await this.provider.createSubscriptionCheckout!({ priceRef: await this.priceRef(plan.id), localId: pending.id, professionalId: pid, customerEmail: me.email, returnUrl: this.safeReturnUrl(returnUrl), planName: plan.name });
    await this.prisma.professionalSubscription.update({ where: { id: pending.id }, data: { providerRef: co.reference } });
    return { status: 'checkout', checkoutUrl: co.checkoutUrl, subscriptionId: pending.id };
  }

  /** Back from the payment page: ask the provider right away (the webhook may still be on its way). */
  async sync(user: AuthUser) {
    const pid = requirePro(user);
    const pending = await this.prisma.professionalSubscription.findFirst({ where: { professionalId: pid, status: 'PENDING', provider: this.provider.name }, orderBy: { createdAt: 'desc' } });
    if (pending?.providerRef && this.provider.subscriptionFromCheckout) {
      const s = await this.provider.subscriptionFromCheckout(pending.providerRef).catch(() => null);
      if (s) await this.activateFromCheckout(pending.id, s);
    }
    return this.summary(user);
  }

  private async activateFromCheckout(localId: string, s: ProviderSubscription) {
    const sub = await this.prisma.professionalSubscription.findUnique({ where: { id: localId }, include: { plan: true } });
    if (!sub || sub.status !== 'PENDING') return;
    await this.prisma.$transaction([
      // The new plan replaces any previous one.
      this.prisma.professionalSubscription.updateMany({ where: { professionalId: sub.professionalId, status: { in: ['ACTIVE', 'PAST_DUE'] }, id: { not: sub.id } }, data: { status: 'CANCELLED' } }),
      this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { providerRef: s.ref, status: s.status === 'PENDING' ? 'ACTIVE' : s.status, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd } }),
    ]);
    await this.audit.log({ action: 'subscription.start', entityType: 'ProfessionalSubscription', entityId: sub.id, metadata: { plan: sub.plan.code, provider: sub.provider, ref: s.ref } });
    await this.notifyChange(sub.professionalId, `Welcome to ${sub.plan.name}!`, `Payment received. ${this.describe(sub.plan)}`);
  }

  /** Provider events (webhooks). */
  async onProviderCheckout(reference: string, subscriptionRef: string | null, localId: string | null) {
    const sub = localId ? await this.prisma.professionalSubscription.findUnique({ where: { id: localId } }) : await this.prisma.professionalSubscription.findUnique({ where: { providerRef: reference } });
    if (!sub || !subscriptionRef || !this.provider.getSubscription) return;
    await this.activateFromCheckout(sub.id, await this.provider.getSubscription(subscriptionRef));
  }

  async onProviderUpdate(s: ProviderSubscription) {
    const sub = await this.prisma.professionalSubscription.findUnique({ where: { providerRef: s.ref }, include: { plan: true } });
    if (!sub) return; // not activated yet: the checkout event handles it
    const ended = s.status === 'CANCELLED';
    await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { status: ended ? (sub.currentPeriodEnd < new Date() ? 'EXPIRED' : 'CANCELLED') : s.status === 'PENDING' ? sub.status : s.status, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: s.cancelAtPeriodEnd } });
    if (ended && sub.status !== 'CANCELLED') await this.notifyChange(sub.professionalId, `Your ${sub.plan.name} plan has ended`, 'You are back on the Free plan (up to 8 new requests per day). You can choose a plan again at any time.');
  }

  async onProviderPaymentFailed(subscriptionRef: string) {
    const sub = await this.prisma.professionalSubscription.findUnique({ where: { providerRef: subscriptionRef }, include: { plan: true } });
    if (!sub) return;
    await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    await this.notifyChange(sub.professionalId, `Payment for ${sub.plan.name} failed`, 'We could not charge your card for this month. Please update your payment method; we will try again in a few days.');
  }

  /** Cancel = stay on the plan until the end of the paid month, then Free. */
  async cancel(user: AuthUser) {
    const sub = await this.current(user);
    if (!sub) return { ok: true };
    if (sub.providerRef && sub.provider === this.provider.name && this.provider.setCancelAtPeriodEnd) {
      const s = await this.provider.setCancelAtPeriodEnd(sub.providerRef, true);
      await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true, currentPeriodEnd: s.currentPeriodEnd } });
    } else {
      await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    }
    await this.audit.log({ actorId: user.id, action: 'subscription.cancel', entityType: 'ProfessionalSubscription', entityId: sub.id, metadata: { plan: sub.plan.code, until: sub.currentPeriodEnd } });
    return { ok: true, activeUntil: sub.currentPeriodEnd };
  }

  async resume(user: AuthUser) {
    const sub = await this.current(user);
    if (!sub) throw new NotFoundException('No plan to resume');
    if (sub.providerRef && sub.provider === this.provider.name && this.provider.setCancelAtPeriodEnd) await this.provider.setCancelAtPeriodEnd(sub.providerRef, false);
    await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: false } });
    return { ok: true };
  }

  /** Hourly: end cancelled plans at the end of their month; renew simulated ones. */
  @Cron(CronExpression.EVERY_HOUR)
  async renewals() {
    if (process.env.DISABLE_SCHEDULER === 'true') return;
    const due = await this.prisma.professionalSubscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lt: new Date() } }, include: { plan: true } });
    for (const sub of due) {
      if (sub.provider === 'simulated' && !sub.cancelAtPeriodEnd) {
        await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(sub.currentPeriodEnd.getTime() + PERIOD_DAYS * 864e5) } });
      } else if (sub.provider === 'simulated' || sub.cancelAtPeriodEnd) {
        await this.prisma.professionalSubscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
        await this.notifyChange(sub.professionalId, `Your ${sub.plan.name} plan has ended`, 'You are back on the Free plan (up to 8 new requests per day). You can choose a plan again at any time.');
      } else if (sub.providerRef && this.provider.getSubscription) {
        await this.onProviderUpdate(await this.provider.getSubscription(sub.providerRef)).catch((e) => this.log.warn((e as Error).message));
      }
    }
  }

  private describe(plan: { name: string; features: unknown }) {
    const f = features(plan as any);
    return `${f.requestsPerDay === null ? 'Unlimited new requests' : `Up to ${f.requestsPerDay} new requests per day`}${f.visibility ? ', and customers see you higher in search' : ''}.`;
  }

  private async notifyChange(professionalId: string, title: string, body: string) {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: professionalId }, select: { userId: true } });
    if (pro) await this.notifications.notify({ userId: pro.userId, type: 'SUBSCRIPTION_UPDATED', title, body, data: { url: '/pro/plans' } });
  }

  adminPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: [{ countryCode: 'asc' }, { sortOrder: 'asc' }, { priceMinor: 'asc' }], include: { _count: { select: { subscriptions: { where: { status: { in: ['ACTIVE', 'PAST_DUE'] } } } } } } });
  }

  async upsertPlan(admin: AuthUser, id: string | null, dto: PlanDto) {
    const data = { ...dto, features: (dto.features ?? {}) as any };
    let plan;
    if (id) {
      const before = await this.prisma.subscriptionPlan.findUniqueOrThrow({ where: { id } });
      // A new price needs a new recurring price at the provider (existing subscribers keep theirs).
      const priceChanged = before.priceMinor !== dto.priceMinor || before.currency !== dto.currency;
      plan = await this.prisma.subscriptionPlan.update({ where: { id }, data: { ...data, ...(priceChanged ? { providerPriceRef: null } : {}) } });
    } else plan = await this.prisma.subscriptionPlan.create({ data });
    await this.audit.log({ actorId: admin.id, action: id ? 'admin.plan.update' : 'admin.plan.create', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: dto as object });
    return plan;
  }

  /** Readable amount for messages. */
  price(plan: { priceMinor: number; currency: string }) {
    return formatMoney(plan.priceMinor, plan.currency);
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private s: SubscriptionsService) {}

  @Get('plans')
  plans(@CurrentUser() user: AuthUser) {
    return this.s.plans(user);
  }

  @Get('current')
  current(@CurrentUser() user: AuthUser) {
    return this.s.current(user);
  }

  /** Plan, today's usage (used / remaining / missed) and billing state for the professional. */
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.s.summary(user);
  }

  @Post('subscribe/:planId')
  subscribe(@CurrentUser() user: AuthUser, @Param('planId') planId: string, @Body() dto: SubscribeDto) {
    return this.s.subscribe(user, planId, dto?.returnUrl);
  }

  @Post('sync')
  sync(@CurrentUser() user: AuthUser) {
    return this.s.sync(user);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser) {
    return this.s.cancel(user);
  }

  @Post('resume')
  resume(@CurrentUser() user: AuthUser) {
    return this.s.resume(user);
  }

  @Permission('plans.manage')
  @Get('admin/plans')
  adminPlans() {
    return this.s.adminPlans();
  }

  @Permission('plans.manage')
  @Post('admin/plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: PlanDto) {
    return this.s.upsertPlan(user, null, dto);
  }

  @Permission('plans.manage')
  @Put('admin/plans/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDto) {
    return this.s.upsertPlan(user, id, dto);
  }
}

@Global()
@Module({ controllers: [SubscriptionsController], providers: [SubscriptionsService, PlansService], exports: [PlansService, SubscriptionsService] })
export class SubscriptionsModule {}
