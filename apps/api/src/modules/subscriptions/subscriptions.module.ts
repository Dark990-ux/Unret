import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { requirePro } from '../../common/guards';
import { PrismaService } from '../../common/prisma.service';

class PlanDto {
  @Matches(/^[a-z0-9_-]{2,30}$/) code: string;
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(2, 2) countryCode: string;
  @IsInt() @Min(0) priceMinor: number;
  @IsString() @Length(3, 3) currency: string;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Professional subscription plans. Subscriptions unlock tools (analytics, team seats, …) —
 * they never influence matching or search ranking (PRD §13, §20).
 */
@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async plans(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.prisma.subscriptionPlan.findMany({ where: { countryCode: u.countryCode, isActive: true }, orderBy: { priceMinor: 'asc' } });
  }

  async current(user: AuthUser) {
    return this.prisma.professionalSubscription.findFirst({
      where: { professionalId: requirePro(user), status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      include: { plan: true },
    });
  }

  /** Payment for subscriptions goes through the PSP's billing product in production. */
  async subscribe(user: AuthUser, planId: string) {
    const pid = requirePro(user);
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan?.isActive) throw new BadRequestException('Plan not available');
    await this.prisma.professionalSubscription.updateMany({ where: { professionalId: pid, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    const sub = await this.prisma.professionalSubscription.create({ data: { professionalId: pid, planId, currentPeriodEnd: new Date(Date.now() + 30 * 864e5) } });
    await this.audit.log({ actorId: user.id, action: 'subscription.start', entityType: 'ProfessionalSubscription', entityId: sub.id, metadata: { plan: plan.code } });
    return sub;
  }

  async cancel(user: AuthUser) {
    await this.prisma.professionalSubscription.updateMany({ where: { professionalId: requirePro(user), status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
    return { ok: true };
  }

  adminPlans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: [{ countryCode: 'asc' }, { priceMinor: 'asc' }], include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } } } });
  }

  async upsertPlan(admin: AuthUser, id: string | null, dto: PlanDto) {
    const data = { ...dto, features: (dto.features ?? {}) as any };
    const plan = id ? await this.prisma.subscriptionPlan.update({ where: { id }, data }) : await this.prisma.subscriptionPlan.create({ data });
    await this.audit.log({ actorId: admin.id, action: id ? 'admin.plan.update' : 'admin.plan.create', entityType: 'SubscriptionPlan', entityId: plan.id, metadata: dto as object });
    return plan;
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

  @Post('subscribe/:planId')
  subscribe(@CurrentUser() user: AuthUser, @Param('planId') planId: string) {
    return this.s.subscribe(user, planId);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser) {
    return this.s.cancel(user);
  }

  @Roles('ADMIN')
  @Get('admin/plans')
  adminPlans() {
    return this.s.adminPlans();
  }

  @Roles('ADMIN')
  @Post('admin/plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: PlanDto) {
    return this.s.upsertPlan(user, null, dto);
  }

  @Roles('ADMIN')
  @Put('admin/plans/:id')
  updatePlan(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDto) {
    return this.s.upsertPlan(user, id, dto);
  }
}

@Module({ controllers: [SubscriptionsController], providers: [SubscriptionsService] })
export class SubscriptionsModule {}
