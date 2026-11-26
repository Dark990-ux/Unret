import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { AuditService } from '../../common/audit.service';
import { AuthUser, ClientIp, CurrentUser, Permission, Roles } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { JobsService } from '../jobs/jobs.service';
import { hasAdminPermission } from '@unret/shared';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupportService } from '../support/support.module';
import { ProfessionalsService } from '../professionals/professionals.service';

class UsersQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'DELETED']) status?: string;
  @IsOptional() @IsIn(['customer', 'professional', 'admin']) type?: string;
}
class SuspendDto {
  @IsString() @Length(5, 500) reason: string;
}
class ReportActionDto {
  @IsIn(['IN_REVIEW', 'RESOLVED', 'DISMISSED']) status: 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  @IsOptional() @IsString() @MaxLength(2000) resolution?: string;
}
class DisputeResolveDto {
  @IsIn(['COMPLETED', 'CANCELLED', 'IN_PROGRESS']) outcome: 'COMPLETED' | 'CANCELLED' | 'IN_PROGRESS';
  @IsString() @Length(5, 2000) resolution: string;
}
class ReviewModerationDto {
  @IsIn(['PUBLISHED', 'HIDDEN', 'UNDER_REVIEW']) status: 'PUBLISHED' | 'HIDDEN' | 'UNDER_REVIEW';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
class NoteDto {
  @IsString() @Length(5, 1000) note: string;
}
class NotifyUserDto {
  @IsString() @Length(3, 120) title: string;
  @IsString() @Length(3, 1000) body: string;
}
class SetPlanDto {
  @IsString() @Length(2, 30) planCode: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) days?: number;
}
class JobsQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
}
class TeamAddDto {
  @IsString() @MaxLength(200) email: string;
  @IsIn(['OWNER', 'SUPPORT', 'MODERATOR', 'FINANCE']) role: AdminRoleName;
}
class TeamRoleDto {
  @IsIn(['OWNER', 'SUPPORT', 'MODERATOR', 'FINANCE']) role: AdminRoleName;
}
type AdminRoleName = 'OWNER' | 'SUPPORT' | 'MODERATOR' | 'FINANCE';
class CountryDto {
  @IsString() @Length(2, 2) code: string;
  @IsString() @Length(2, 80) name: string;
  @IsString() @Length(3, 3) currency: string;
  @IsString() @Length(2, 5) defaultLanguage: string;
  @IsString() defaultTimezone: string;
  @IsString() phonePrefix: string;
  @IsBoolean() isActive: boolean;
  @IsInt() @Min(0) @Max(5000) platformFeeBps: number;
}

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private audit: AuditService, private jobs: JobsService, private pros: ProfessionalsService, private notifications: NotificationsService, private support: SupportService) {}

  async users(q: UsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.type === 'professional' ? { professional: { isNot: null } } : q.type === 'admin' ? { role: 'ADMIN' } : q.type === 'customer' ? { professional: null } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { id: q.q }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, ...paginate(q),
        select: {
          id: true, name: true, email: true, phone: true, role: true, status: true, countryCode: true, createdAt: true, lastLoginAt: true,
          professional: { select: { id: true, visibility: true, ratingAvg: true, ratingCount: true, completedJobs: true } },
          _count: { select: { requests: true, customerJobs: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, phone: true, role: true, status: true, suspendedReason: true, countryCode: true, preferredLanguage: true,
        createdAt: true, lastLoginAt: true, mfaEnabled: true,
        professional: { include: { services: { include: { category: { select: { slug: true } } } }, verifications: { select: { id: true, type: true, status: true, createdAt: true } }, company: true } },
        requests: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, status: true, createdAt: true } },
        customerJobs: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, agreedPriceMinor: true, currency: true, createdAt: true } },
      },
    });
    if (!u) throw new NotFoundException();
    const [reportsAgainst, auditTrail] = await Promise.all([
      this.prisma.report.findMany({ where: { targetId: { in: [id, u.professional?.id ?? '-'] } }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.findMany({ where: { OR: [{ actorId: id }, { entityId: id }] }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { ...u, reportsAgainst, auditTrail };
  }

  async suspend(admin: AuthUser, id: string, reason: string, ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException();
    if (u.role === 'ADMIN') throw new BadRequestException('Administrators cannot be suspended here');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED', suspendedReason: reason } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.professionalProfile.updateMany({ where: { userId: id }, data: { visibility: 'HIDDEN' } }),
    ]);
    await this.audit.log({ actorId: admin.id, action: 'admin.user.suspend', entityType: 'User', entityId: id, metadata: { reason }, ip });
    return { ok: true };
  }

  async reactivate(admin: AuthUser, id: string, ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { professional: true } });
    if (!u || u.status !== 'SUSPENDED') throw new BadRequestException('User is not suspended');
    await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE', suspendedReason: null } });
    if (u.professional) await this.pros.recomputeVisibility(u.professional.id);
    await this.audit.log({ actorId: admin.id, action: 'admin.user.reactivate', entityType: 'User', entityId: id, ip });
    return { ok: true };
  }

  // ── Dashboard ──

  /** Everything that needs a person, in one place; each queue only for staff allowed to act on it. */
  async overview(admin: AuthUser) {
    const can = (p: Parameters<typeof hasAdminPermission>[1]) => hasAdminPermission(admin.adminRole, p);
    const dayAgo = new Date(Date.now() - 864e5), weekAgo = new Date(Date.now() - 7 * 864e5);
    const [tickets, reports, disputes, verifications, failedPayments, stuckPayouts, pastDue, newUsers, newRequests, activeJobs, recentTickets] = await Promise.all([
      can('tickets.manage') ? this.support.counts(admin) : null,
      can('content.moderate') ? this.prisma.report.count({ where: { status: 'OPEN' } }) : null,
      can('disputes.manage') ? this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } }) : null,
      can('verifications.manage') ? this.prisma.verification.count({ where: { status: 'PENDING' } }) : null,
      can('payments.view') ? this.prisma.payment.count({ where: { status: 'FAILED', createdAt: { gt: weekAgo } } }) : null,
      can('payments.view') ? this.prisma.payment.count({ where: { payoutStatus: 'HELD', status: 'SUCCEEDED', job: { status: 'COMPLETED' }, createdAt: { lt: dayAgo } } }) : null,
      can('payments.view') ? this.prisma.professionalSubscription.count({ where: { status: 'PAST_DUE' } }) : null,
      this.prisma.user.count({ where: { createdAt: { gt: dayAgo } } }),
      this.prisma.serviceRequest.count({ where: { publishedAt: { gt: dayAgo } } }),
      this.prisma.job.count({ where: { status: { in: ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'] } } }),
      can('tickets.manage') ? this.prisma.supportTicket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: [{ priority: 'desc' }, { lastMessageAt: 'desc' }], take: 6, include: { user: { select: { name: true } } } }) : [],
    ]);
    return { tickets, reports, disputes, verifications, failedPayments, stuckPayouts, pastDue, today: { newUsers, newRequests, activeJobs }, recentTickets };
  }

  // ── Helping users ──

  async resetMfa(admin: AuthUser, id: string, ip?: string) {
    await this.prisma.user.update({ where: { id }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.audit.log({ actorId: admin.id, action: 'admin.user.reset_mfa', entityType: 'User', entityId: id, ip });
    await this.notifications.notify({ userId: id, type: 'SUPPORT_UPDATED', title: 'Two-factor login was turned off', body: 'UNRET support turned off two-factor login on your account. You can turn it on again in Settings.', data: { url: '/settings' } });
    return { ok: true };
  }

  async notifyUser(admin: AuthUser, id: string, dto: NotifyUserDto, ip?: string) {
    await this.notifications.notify({ userId: id, type: 'SUPPORT_UPDATED', title: dto.title, body: dto.body, data: { url: '/help' } });
    await this.audit.log({ actorId: admin.id, action: 'admin.user.notify', entityType: 'User', entityId: id, metadata: { title: dto.title }, ip });
    return { ok: true };
  }

  /** Give or change a professional's plan (goodwill, fixing a billing problem). "free" ends the paid plan now. */
  async setPlan(admin: AuthUser, id: string, dto: SetPlanDto, ip?: string) {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { userId: id }, select: { id: true, countryCode: true } });
    if (!pro) throw new BadRequestException('This person has no professional profile');
    await this.prisma.professionalSubscription.updateMany({ where: { professionalId: pro.id, status: { in: ['ACTIVE', 'PAST_DUE', 'PENDING'] } }, data: { status: 'CANCELLED' } });
    if (dto.planCode !== 'free') {
      const plan = await this.prisma.subscriptionPlan.findFirst({ where: { code: dto.planCode, countryCode: pro.countryCode, isActive: true } });
      if (!plan) throw new BadRequestException('Plan not available');
      await this.prisma.professionalSubscription.create({ data: { professionalId: pro.id, planId: plan.id, status: 'ACTIVE', provider: 'admin', cancelAtPeriodEnd: true, currentPeriodEnd: new Date(Date.now() + (dto.days ?? 30) * 864e5) } });
      await this.notifications.notify({ userId: id, type: 'SUBSCRIPTION_UPDATED', title: `UNRET gave you the ${plan.name} plan`, body: `Free of charge for ${dto.days ?? 30} days. It ends automatically; nothing will be charged.`, data: { url: '/pro/plans' } });
    }
    await this.audit.log({ actorId: admin.id, action: 'admin.user.set_plan', entityType: 'User', entityId: id, metadata: dto as object, ip });
    return { ok: true };
  }

  /** Conversations are private: staff read them only for a case, and every read is logged. */
  async userConversations(admin: AuthUser, id: string) {
    const pro = await this.prisma.professionalProfile.findUnique({ where: { userId: id }, select: { id: true } });
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ customerId: id }, ...(pro ? [{ professionalId: pro.id }] : [])] }, orderBy: { lastMessageAt: 'desc' }, take: 50,
      include: { customer: { select: { name: true } }, professional: { select: { businessName: true, user: { select: { name: true } } } }, request: { select: { title: true } }, _count: { select: { messages: true } } },
    });
    return rows.map((c) => ({ id: c.id, customer: c.customer.name, professional: c.professional.businessName ?? c.professional.user.name, request: c.request?.title ?? null, messages: c._count.messages, lastMessageAt: c.lastMessageAt }));
  }

  async readConversation(admin: AuthUser, id: string, reason: string | undefined, ip?: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true } }, professional: { select: { businessName: true, user: { select: { id: true, name: true } } } }, request: { select: { id: true, title: true } }, messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true } } } } },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    await this.audit.log({ actorId: admin.id, action: 'admin.conversation.read', entityType: 'Conversation', entityId: id, metadata: { reason: reason ?? null }, ip });
    return c;
  }

  // ── Jobs ──

  async jobsList(q: JobsQuery) {
    const where: Prisma.JobWhereInput = {
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.q ? { OR: [{ id: q.q }, { request: { title: { contains: q.q, mode: 'insensitive' } } }, { customer: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } }, { professional: { OR: [{ businessName: { contains: q.q, mode: 'insensitive' } }, { user: { name: { contains: q.q, mode: 'insensitive' } } }] } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { request: { select: { title: true } }, customer: { select: { id: true, name: true } }, professional: { select: { businessName: true, user: { select: { id: true, name: true } } } } } }),
      this.prisma.job.count({ where }),
    ]);
    return pageResult(rows.map((j) => ({ id: j.id, title: j.request.title, status: j.status, priceMinor: j.agreedPriceMinor, currency: j.currency, paymentMethod: j.paymentMethod, customer: j.customer, professional: { id: j.professional.user.id, name: j.professional.businessName ?? j.professional.user.name }, createdAt: j.createdAt })), total, q);
  }

  async closeRequest(admin: AuthUser, id: string, note: string, ip?: string) {
    const r = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (!['DRAFT', 'PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status)) throw new BadRequestException('This request is already closed');
    await this.prisma.$transaction([
      this.prisma.serviceRequest.update({ where: { id }, data: { status: 'CANCELLED' } }),
      this.prisma.offer.updateMany({ where: { requestId: id, status: { in: ['PENDING', 'MODIFICATION_REQUESTED'] } }, data: { status: 'EXPIRED' } }),
    ]);
    await this.audit.log({ actorId: admin.id, action: 'admin.request.close', entityType: 'ServiceRequest', entityId: id, metadata: { note }, ip });
    await this.notifications.notify({ userId: r.customerId, type: 'JOB_STATUS_CHANGED', title: 'Your request was closed by UNRET support', body: `"${r.title}": ${note}`, data: { url: `/requests/${id}` } });
    return { ok: true };
  }

  // ── Admin team ──

  team() {
    return this.prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true, adminRole: true, status: true, lastLoginAt: true, mfaEnabled: true } });
  }

  private async ownersLeft(exceptId: string) {
    return this.prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: exceptId }, OR: [{ adminRole: 'OWNER' }, { adminRole: null }] } });
  }

  async addToTeam(admin: AuthUser, email: string, role: AdminRoleName, ip?: string) {
    const u = await this.prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: 'insensitive' } } });
    if (!u || u.status !== 'ACTIVE') throw new NotFoundException('No active UNRET account with this email. Ask the person to sign up first.');
    if (u.role === 'ADMIN') throw new BadRequestException('This person is already an administrator');
    await this.prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN', adminRole: role } });
    await this.audit.log({ actorId: admin.id, action: 'admin.team.add', entityType: 'User', entityId: u.id, metadata: { role }, ip });
    await this.notifications.notify({ userId: u.id, type: 'SUPPORT_UPDATED', title: 'You are now an UNRET administrator', body: `Role: ${role}. Open the admin area from your account menu.`, data: { url: '/admin' } });
    return this.team();
  }

  async setTeamRole(admin: AuthUser, id: string, role: AdminRoleName, ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.role !== 'ADMIN') throw new NotFoundException('Administrator not found');
    if (role !== 'OWNER' && (u.adminRole ?? 'OWNER') === 'OWNER' && !(await this.ownersLeft(id))) throw new BadRequestException('The platform needs at least one Owner');
    await this.prisma.user.update({ where: { id }, data: { adminRole: role } });
    await this.audit.log({ actorId: admin.id, action: 'admin.team.role', entityType: 'User', entityId: id, metadata: { from: u.adminRole, to: role }, ip });
    return this.team();
  }

  async removeFromTeam(admin: AuthUser, id: string, ip?: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.role !== 'ADMIN') throw new NotFoundException('Administrator not found');
    if ((u.adminRole ?? 'OWNER') === 'OWNER' && !(await this.ownersLeft(id))) throw new BadRequestException('The platform needs at least one Owner');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { role: 'USER', adminRole: null } }),
      // Sign them out everywhere so the admin access ends now.
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: admin.id, action: 'admin.team.remove', entityType: 'User', entityId: id, metadata: { role: u.adminRole }, ip });
    return this.team();
  }

  async reports(q: PageQuery & { status?: string }) {
    const where = { status: (q.status ?? 'OPEN') as any };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({ where, orderBy: { createdAt: 'asc' }, ...paginate(q), include: { reporter: { select: { id: true, name: true } }, handledBy: { select: { name: true } } } }),
      this.prisma.report.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }

  async handleReport(admin: AuthUser, id: string, dto: ReportActionDto) {
    const r = await this.prisma.report.update({ where: { id }, data: { status: dto.status, resolution: dto.resolution, handledById: admin.id } });
    await this.audit.log({ actorId: admin.id, action: 'admin.report.update', entityType: 'Report', entityId: id, metadata: dto as object });
    return r;
  }

  async disputes(q: PageQuery & { status?: string }) {
    const where = q.status ? { status: q.status as any } : { status: { in: ['OPEN', 'UNDER_REVIEW'] as any } };
    const [rows, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where, orderBy: { createdAt: 'asc' }, ...paginate(q),
        include: {
          openedBy: { select: { id: true, name: true } }, resolvedBy: { select: { name: true } },
          job: { select: { id: true, status: true, agreedPriceMinor: true, currency: true, request: { select: { title: true } }, customer: { select: { name: true } }, professional: { select: { businessName: true, user: { select: { name: true } } } } } },
        },
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }

  async markDisputeUnderReview(admin: AuthUser, id: string) {
    await this.prisma.dispute.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    await this.audit.log({ actorId: admin.id, action: 'admin.dispute.review', entityType: 'Dispute', entityId: id });
    return { ok: true };
  }

  async reviews(q: PageQuery & { status?: string }) {
    const where = q.status ? { status: q.status as any } : {};
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { customer: { select: { name: true } }, professional: { select: { id: true, businessName: true, user: { select: { name: true } } } } } }),
      this.prisma.review.count({ where }),
    ]);
    const reported = await this.prisma.report.findMany({ where: { targetType: 'REVIEW', targetId: { in: rows.map((r) => r.id) }, status: { in: ['OPEN', 'IN_REVIEW'] } }, select: { targetId: true } });
    const flagged = new Set(reported.map((r) => r.targetId));
    return pageResult(rows.map((r) => ({ ...r, openReports: flagged.has(r.id) })), total, q);
  }

  async moderateReview(admin: AuthUser, id: string, dto: ReviewModerationDto) {
    const r = await this.prisma.review.update({ where: { id }, data: { status: dto.status, moderationNote: dto.note } });
    await this.pros.recomputeReputation(r.professionalId);
    await this.audit.log({ actorId: admin.id, action: 'admin.review.moderate', entityType: 'Review', entityId: id, metadata: dto as object });
    return r;
  }

  countries() {
    return this.prisma.country.findMany({ orderBy: { code: 'asc' } });
  }

  async upsertCountry(admin: AuthUser, dto: CountryDto) {
    const code = dto.code.toUpperCase();
    const c = await this.prisma.country.upsert({ where: { code }, create: { ...dto, code, currency: dto.currency.toUpperCase() }, update: { ...dto, code, currency: dto.currency.toUpperCase() } });
    await this.audit.log({ actorId: admin.id, action: 'admin.country.upsert', entityType: 'Country', entityId: code, metadata: dto as object });
    return c;
  }

  async auditLog(q: PageQuery & { action?: string; entityId?: string; actorId?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q), include: { actor: { select: { name: true, role: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }

  /** Business KPIs (PRD §26). The headline metric: share of published requests that became completed jobs. */
  async analytics(days = 30) {
    const since = new Date(Date.now() - days * 864e5);
    const thirty = new Date(Date.now() - 30 * 864e5);
    const [
      registeredPros, activePros, activeCustomers, published, withOne, withTwo, acceptedOffers, decidedOffers,
      completedJobs, cancelledJobs, disputedJobs, allJobs, firstOffer, repeatCustomers, retainedPros, revenue, requestsByCategory, totalUsers,
    ] = await Promise.all([
      this.prisma.professionalProfile.count(),
      this.prisma.professionalProfile.count({ where: { OR: [{ offers: { some: { createdAt: { gte: thirty } } } }, { jobs: { some: { updatedAt: { gte: thirty } } } }] } }),
      this.prisma.user.count({ where: { OR: [{ requests: { some: { createdAt: { gte: thirty } } } }, { customerJobs: { some: { updatedAt: { gte: thirty } } } }] } }),
      this.prisma.serviceRequest.count({ where: { publishedAt: { gte: since } } }),
      this.prisma.serviceRequest.count({ where: { publishedAt: { gte: since }, offers: { some: {} } } }),
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM (SELECT r.id FROM "ServiceRequest" r JOIN "Offer" o ON o."requestId" = r.id WHERE r."publishedAt" >= ${since} GROUP BY r.id HAVING COUNT(o.id) >= 2) t`,
      this.prisma.offer.count({ where: { createdAt: { gte: since }, status: 'ACCEPTED' } }),
      this.prisma.offer.count({ where: { createdAt: { gte: since }, status: { in: ['ACCEPTED', 'REJECTED'] } } }),
      this.prisma.job.count({ where: { request: { publishedAt: { gte: since } }, status: 'COMPLETED' } }),
      this.prisma.job.count({ where: { createdAt: { gte: since }, status: 'CANCELLED' } }),
      this.prisma.job.count({ where: { createdAt: { gte: since }, disputes: { some: {} } } }),
      this.prisma.job.count({ where: { createdAt: { gte: since } } }),
      this.prisma.$queryRaw<{ minutes: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (f.first - r."publishedAt")) / 60)::float AS minutes
        FROM "ServiceRequest" r JOIN (SELECT "requestId", MIN("createdAt") AS first FROM "Offer" GROUP BY "requestId") f ON f."requestId" = r.id
        WHERE r."publishedAt" >= ${since}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM (SELECT "customerId" FROM "Job" WHERE status = 'COMPLETED' GROUP BY "customerId" HAVING COUNT(*) >= 2) t`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT p.id)::bigint AS n FROM "ProfessionalProfile" p
        WHERE p."createdAt" < now() - interval '60 days'
          AND EXISTS (SELECT 1 FROM "Offer" o WHERE o."professionalId" = p.id AND o."createdAt" >= now() - interval '30 days')`,
      this.prisma.payment.groupBy({ by: ['currency'], where: { createdAt: { gte: since }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, _sum: { grossMinor: true, platformFeeMinor: true } }),
      this.prisma.serviceRequest.groupBy({ by: ['categoryId'], where: { publishedAt: { gte: since } }, _count: true, orderBy: { _count: { categoryId: 'desc' } }, take: 10 }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
    ]);
    const prosOlderThan60 = await this.prisma.professionalProfile.count({ where: { createdAt: { lt: new Date(Date.now() - 60 * 864e5) } } });
    const cats = await this.prisma.serviceCategory.findMany({ where: { id: { in: requestsByCategory.map((r) => r.categoryId) } }, include: { translations: { where: { locale: 'en' } } } });
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
    return {
      periodDays: days,
      headline: { requestToCompletedJobRate: pct(completedJobs, published), label: 'Published requests that became completed jobs' },
      supply: { registeredProfessionals: registeredPros, activeProfessionals30d: activePros, professionalRetention: pct(Number(retainedPros[0].n), prosOlderThan60) },
      demand: { activeCustomers30d: activeCustomers, totalActiveUsers: totalUsers, repeatCustomers: Number(repeatCustomers[0].n) },
      funnel: {
        publishedRequests: published,
        requestsWithOneOffer: withOne, requestsWithOneOfferRate: pct(withOne, published),
        requestsWithTwoOffers: Number(withTwo[0].n), requestsWithTwoOffersRate: pct(Number(withTwo[0].n), published),
        avgMinutesToFirstOffer: firstOffer[0].minutes === null ? null : Math.round(firstOffer[0].minutes),
        offerAcceptanceRate: pct(acceptedOffers, decidedOffers),
        completedJobs,
      },
      quality: { cancellationRate: pct(cancelledJobs, allJobs), disputeRate: pct(disputedJobs, allJobs) },
      revenue,
      topCategories: requestsByCategory.map((r) => ({ categoryId: r.categoryId, name: cats.find((c) => c.id === r.categoryId)?.translations[0]?.name ?? r.categoryId, requests: r._count })),
    };
  }

  /** Simple, explainable fraud and risk indicators for manual review. */
  async fraudIndicators() {
    const [highCancellation, manyReports, burstReviews, sharedPhones] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT p.id, COALESCE(p."businessName", u.name) AS name, p."completedJobs", p."cancelledJobs"
        FROM "ProfessionalProfile" p JOIN "User" u ON u.id = p."userId"
        WHERE p."cancelledJobs" >= 2 AND p."cancelledJobs"::float / NULLIF(p."cancelledJobs" + p."completedJobs", 0) > 0.3
        ORDER BY p."cancelledJobs" DESC LIMIT 50`,
      this.prisma.$queryRaw<any[]>`
        SELECT "targetType", "targetId", COUNT(*)::int AS reports FROM "Report"
        WHERE status IN ('OPEN','IN_REVIEW') GROUP BY "targetType", "targetId" HAVING COUNT(*) >= 2 ORDER BY reports DESC LIMIT 50`,
      this.prisma.$queryRaw<any[]>`
        SELECT r."professionalId", r."customerId", COUNT(*)::int AS reviews FROM "Review" r
        WHERE r."createdAt" > now() - interval '30 days' GROUP BY r."professionalId", r."customerId" HAVING COUNT(*) >= 3 LIMIT 50`,
      this.prisma.$queryRaw<any[]>`
        SELECT "suspendedReason" AS reason, COUNT(*)::int AS n FROM "User" WHERE status = 'SUSPENDED' GROUP BY "suspendedReason" LIMIT 20`,
    ]);
    return {
      highCancellationProfessionals: highCancellation,
      repeatedlyReportedTargets: manyReports,
      repeatedReviewsSamePair: burstReviews,
      suspensionReasons: sharedPhones,
    };
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService, private jobs: JobsService, private auth: AuthService) {}

  @Permission('dashboard.view')
  @Get('overview')
  overview(@CurrentUser() u: AuthUser) {
    return this.admin.overview(u);
  }

  @Permission('users.manage')
  @Post('users/:id/password-reset')
  passwordReset(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.auth.sendPasswordReset(id, { byAdminId: u.id, hours: 24 });
  }

  @Permission('users.manage')
  @Post('users/:id/reset-mfa')
  resetMfa(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.admin.resetMfa(u, id, ip);
  }

  @Permission('users.manage')
  @Post('users/:id/notify')
  notifyUser(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NotifyUserDto, @ClientIp() ip: string) {
    return this.admin.notifyUser(u, id, dto, ip);
  }

  @Permission('payments.manage')
  @Post('users/:id/plan')
  setPlan(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SetPlanDto, @ClientIp() ip: string) {
    return this.admin.setPlan(u, id, dto, ip);
  }

  @Permission('conversations.read')
  @Get('users/:id/conversations')
  userConversations(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admin.userConversations(u, id);
  }

  @Permission('conversations.read')
  @Get('conversations/:id')
  readConversation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('reason') reason: string | undefined, @ClientIp() ip: string) {
    return this.admin.readConversation(u, id, reason, ip);
  }

  @Permission('jobs.manage', 'disputes.manage')
  @Get('jobs')
  jobsList(@Query() q: JobsQuery) {
    return this.admin.jobsList(q);
  }

  @Permission('jobs.manage')
  @Post('jobs/:id/cancel')
  cancelJob(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.jobs.adminSetStatus(u, id, 'CANCELLED', dto.note);
  }

  @Permission('jobs.manage')
  @Post('jobs/:id/complete')
  completeJob(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.jobs.adminSetStatus(u, id, 'COMPLETED', dto.note);
  }

  @Permission('jobs.manage', 'content.moderate')
  @Post('requests/:id/close')
  closeRequest(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto, @ClientIp() ip: string) {
    return this.admin.closeRequest(u, id, dto.note, ip);
  }

  @Permission('analytics.view')
  @Get('analytics')
  analytics(@Query('days') days = '30') {
    return this.admin.analytics(Math.min(Math.max(Number(days) || 30, 1), 365));
  }

  @Permission('fraud.view')
  @Get('fraud')
  fraud() {
    return this.admin.fraudIndicators();
  }

  @Permission('users.view')
  @Get('users')
  users(@Query() q: UsersQuery) {
    return this.admin.users(q);
  }

  @Permission('users.view')
  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.user(id);
  }

  @Permission('users.suspend')
  @Post('users/:id/suspend')
  suspend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SuspendDto, @ClientIp() ip: string) {
    return this.admin.suspend(u, id, dto.reason, ip);
  }

  @Permission('users.suspend')
  @Post('users/:id/reactivate')
  reactivate(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.admin.reactivate(u, id, ip);
  }

  @Permission('content.moderate')
  @Get('reports')
  reports(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.admin.reports({ ...q, status });
  }

  @Permission('content.moderate')
  @Patch('reports/:id')
  handleReport(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReportActionDto) {
    return this.admin.handleReport(u, id, dto);
  }

  @Permission('disputes.manage')
  @Get('disputes')
  disputes(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.admin.disputes({ ...q, status });
  }

  @Permission('disputes.manage')
  @Post('disputes/:id/review')
  reviewDispute(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admin.markDisputeUnderReview(u, id);
  }

  @Permission('disputes.manage')
  @Post('disputes/:id/resolve')
  resolveDispute(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: DisputeResolveDto) {
    return this.jobs.resolveDispute(u, id, dto.outcome, dto.resolution);
  }

  @Permission('content.moderate')
  @Get('reviews')
  reviews(@Query() q: PageQuery, @Query('status') status?: string) {
    return this.admin.reviews({ ...q, status });
  }

  @Permission('content.moderate')
  @Patch('reviews/:id')
  moderateReview(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReviewModerationDto) {
    return this.admin.moderateReview(u, id, dto);
  }

  @Permission('catalog.manage')
  @Get('countries')
  countries() {
    return this.admin.countries();
  }

  @Permission('catalog.manage')
  @Put('countries')
  upsertCountry(@CurrentUser() u: AuthUser, @Body() dto: CountryDto) {
    return this.admin.upsertCountry(u, dto);
  }

  @Permission('dashboard.view')
  @Get('team')
  team() {
    return this.admin.team();
  }

  @Permission('team.manage')
  @Post('team')
  addToTeam(@CurrentUser() u: AuthUser, @Body() dto: TeamAddDto, @ClientIp() ip: string) {
    return this.admin.addToTeam(u, dto.email, dto.role, ip);
  }

  @Permission('team.manage')
  @Patch('team/:id')
  setTeamRole(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TeamRoleDto, @ClientIp() ip: string) {
    return this.admin.setTeamRole(u, id, dto.role, ip);
  }

  @Permission('team.manage')
  @Delete('team/:id')
  removeFromTeam(@CurrentUser() u: AuthUser, @Param('id') id: string, @ClientIp() ip: string) {
    return this.admin.removeFromTeam(u, id, ip);
  }

  @Permission('audit.view')
  @Get('audit')
  audit(@Query() q: PageQuery, @Query('action') action?: string, @Query('entityId') entityId?: string, @Query('actorId') actorId?: string) {
    return this.admin.auditLog({ ...q, action, entityId, actorId });
  }
}

@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
