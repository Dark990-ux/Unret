import { BadRequestException, Body, Controller, ForbiddenException, Get, Global, Header, Injectable, Logger, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { hasAdminPermission } from '@unret/shared';
import { AuditService } from '../../common/audit.service';
import { AuthUser, CurrentUser, Permission, Public } from '../../common/decorators';
import { PageQuery, pageResult, paginate } from '../../common/pagination';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';
import { EmailChannel } from '../notifications/channels';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const KINDS = ['question', 'problem', 'contact', 'automatic'] as const;
/** Kinds people can choose ("automatic" tickets are opened by UNRET itself, e.g. payment checks). */
const PERSON_KINDS = ['question', 'problem', 'contact'] as const;
const CATEGORIES = ['account', 'payments', 'job', 'technical', 'safety', 'suggestion', 'other'] as const;

class NewTicketDto {
  @IsIn(PERSON_KINDS) kind: (typeof PERSON_KINDS)[number];
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
  @IsString() @Length(3, 140) subject: string;
  @IsString() @Length(10, 5000) message: string;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() requestId?: string;
  @IsOptional() @IsString() paymentId?: string;
  @IsOptional() @IsString() @MaxLength(500) pageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) attachmentKeys?: string[];
}
class GuestContactDto {
  @IsString() @Length(2, 80) name: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
  @IsString() @Length(3, 140) subject: string;
  @IsString() @Length(10, 5000) message: string;
  /** Honeypot: real people leave it empty */
  @IsOptional() @IsString() website?: string;
}
class ReplyDto {
  @IsString() @Length(1, 5000) body: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) attachmentKeys?: string[];
}
class StaffReplyDto extends ReplyDto {
  /** Note for the team only */
  @IsOptional() @IsBoolean() internal?: boolean;
}
class StaffUpdateDto {
  @IsOptional() @IsIn(Object.values(TicketStatus)) status?: TicketStatus;
  @IsOptional() @IsIn(Object.values(TicketPriority)) priority?: TicketPriority;
  /** Staff user id, "me", or null to unassign */
  @IsOptional() @IsString() assigneeId?: string | null;
  /** How the problem was solved — required the first time a ticket is marked solved or closed */
  @IsOptional() @IsString() @Length(5, 2000) resolution?: string;
}
class RegisterQuery extends PageQuery {
  @IsOptional() @IsString() from?: string; // YYYY-MM-DD
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsIn(CATEGORIES) category?: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @IsString() status?: string; // open | solved | <TicketStatus>
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
class StaffListQuery extends PageQuery {
  @IsOptional() @IsString() status?: string; // open (default) | all | <TicketStatus>
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: TicketPriority;
  @IsOptional() @IsString() assignee?: string; // me | none | <id>
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'];
/** A solved ticket is closed automatically after this many days without new messages. */
export const AUTO_CLOSE_DAYS = 14;
type Tx = Prisma.TransactionClient | PrismaService;
/** Safety problems go to the top; payment problems come next. */
const autoPriority = (category: string, kind: string): TicketPriority => (category === 'safety' ? 'URGENT' : category === 'payments' || kind === 'problem' ? 'HIGH' : 'NORMAL');

/**
 * Support center: people contact the team (signed in, or as guests with an email), report problems
 * about a job, request or payment, and talk to staff in one conversation per ticket. Staff assign tickets,
 * set status and priority, reply, and leave internal notes the person never sees.
 */
@Injectable()
export class SupportService {
  private log = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private email: EmailChannel,
    private realtime: RealtimeGateway,
    private audit: AuditService,
  ) {}

  private ref = (n: number) => `#${n}`;

  /** Adds a line to the ticket's permanent history. */
  private event(db: Tx, ticketId: string, actorId: string | null, type: string, extra: { from?: string | null; to?: string | null; note?: string | null } = {}) {
    return db.supportTicketEvent.create({ data: { ticketId, actorId, type, fromValue: extra.from ?? null, toValue: extra.to ?? null, note: extra.note ?? null } });
  }

  /** Staff who handle tickets (for notifications about new ones). */
  private async staffIds() {
    const staff = await this.prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true, adminRole: true } });
    return staff.filter((s) => hasAdminPermission(s.adminRole ?? 'OWNER', 'tickets.manage')).map((s) => s.id);
  }

  private async notifyStaff(t: { id: string; number: number; subject: string; priority: TicketPriority; assigneeId: string | null }, title: string, body: string) {
    const ids = t.assigneeId ? [t.assigneeId] : await this.staffIds();
    for (const id of ids) {
      await this.notifications.notify({ userId: id, type: 'SUPPORT_UPDATED', title, body, data: { ticketId: t.id, url: `/admin/support/${t.id}` } });
      this.realtime.emitToUser(id, 'support', { ticketId: t.id });
    }
  }

  private async checkAttachments(keys: string[] | undefined, userId: string) {
    for (const k of keys ?? []) this.storage.assertOwned(k, userId, 'support');
    return keys ?? [];
  }

  // ── People ──

  async create(user: AuthUser, dto: NewTicketDto) {
    // Links are only kept when the person is involved in that job / request / payment.
    const [job, request, payment] = await Promise.all([
      dto.jobId ? this.prisma.job.findFirst({ where: { id: dto.jobId, OR: [{ customerId: user.id }, { professional: { userId: user.id } }] }, select: { id: true } }) : null,
      dto.requestId ? this.prisma.serviceRequest.findFirst({ where: { id: dto.requestId, OR: [{ customerId: user.id }, { matches: { some: { professional: { userId: user.id } } } }] }, select: { id: true } }) : null,
      dto.paymentId ? this.prisma.payment.findFirst({ where: { id: dto.paymentId, job: { OR: [{ customerId: user.id }, { professional: { userId: user.id } }] } }, select: { id: true } }) : null,
    ]);
    const attachmentKeys = await this.checkAttachments(dto.attachmentKeys, user.id);
    const t = await this.prisma.supportTicket.create({
      data: {
        userId: user.id, kind: dto.kind, category: dto.category, subject: dto.subject.trim(), priority: autoPriority(dto.category, dto.kind),
        jobId: job?.id ?? null, requestId: request?.id ?? null, paymentId: payment?.id ?? null, pageUrl: dto.pageUrl ?? null,
        messages: { create: { authorId: user.id, body: dto.message.trim(), attachmentKeys } },
      },
    });
    await this.event(this.prisma, t.id, user.id, 'created', { to: t.category });
    await this.audit.log({ actorId: user.id, action: 'support.ticket.create', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, category: t.category, kind: t.kind } });
    await this.notifications.notify({ userId: user.id, type: 'SUPPORT_UPDATED', title: `We received your message ${this.ref(t.number)}`, body: 'The UNRET team will reply here, usually within one working day.', data: { ticketId: t.id, url: `/help/tickets/${t.id}` } });
    await this.notifyStaff(t, `New ${t.priority === 'URGENT' ? 'URGENT ' : ''}ticket ${this.ref(t.number)}`, `${t.subject} · ${t.category}`);
    return this.mine(user, t.id);
  }

  /** Contact form for people without an account (or signed out). Replies go by email. */
  async guestContact(dto: GuestContactDto) {
    if (dto.website) return { ok: true }; // bot
    const recent = await this.prisma.supportTicket.count({ where: { email: dto.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - 3600e3) } } });
    if (recent >= 3) throw new BadRequestException('You already sent several messages in the last hour. We will reply to them by email.');
    const t = await this.prisma.supportTicket.create({
      data: {
        name: dto.name.trim(), email: dto.email.trim().toLowerCase(), kind: 'contact', category: dto.category, subject: dto.subject.trim(), priority: autoPriority(dto.category, 'contact'),
        messages: { create: { body: dto.message.trim() } },
      },
    });
    await this.event(this.prisma, t.id, null, 'created', { to: t.category, note: 'Contact form (no account)' });
    await this.email.send({ to: t.email!, subject: `We received your message ${this.ref(t.number)}`, body: `Hi ${t.name},\n\nThank you for contacting UNRET. We will reply to this email address, usually within one working day.\n\nYour message: "${t.subject}"` }).catch(() => undefined);
    await this.notifyStaff(t, `New contact message ${this.ref(t.number)}`, `${t.subject} · from ${t.name} (no account)`);
    return { ok: true, number: t.number };
  }

  async myTickets(user: AuthUser, q: PageQuery) {
    const where = { userId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, orderBy: { lastMessageAt: 'desc' }, ...paginate(q), include: { messages: { where: { internal: false }, orderBy: { createdAt: 'desc' }, take: 1 } } }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return pageResult(rows.map(({ messages, ...t }) => ({ ...t, lastMessage: messages[0] ? { body: messages[0].body.slice(0, 160), fromStaff: messages[0].fromStaff, createdAt: messages[0].createdAt } : null })), total, q);
  }

  private shape(t: any, includeInternal: boolean) {
    return {
      ...t,
      messages: t.messages
        .filter((m: any) => includeInternal || !m.internal)
        .map((m: any) => ({
          id: m.id, body: m.body, fromStaff: m.fromStaff, internal: m.internal, createdAt: m.createdAt,
          // Staff names stay private to people: they see "UNRET Support".
          author: m.fromStaff ? (includeInternal ? m.author?.name ?? 'Staff' : 'UNRET Support') : m.author?.name ?? t.name ?? 'Guest',
          attachments: (m.attachmentKeys ?? []).map((k: string) => ({ key: k, name: k.split('/').pop(), url: this.storage.signedUrl(k) })),
        })),
    };
  }

  async mine(user: AuthUser, id: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } } } });
    if (!t || t.userId !== user.id) throw new NotFoundException('Ticket not found');
    const { assigneeId: _a, ...rest } = t;
    return this.shape(rest, false);
  }

  async reply(user: AuthUser, id: string, dto: ReplyDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t || t.userId !== user.id) throw new NotFoundException('Ticket not found');
    if (t.status === 'CLOSED') throw new BadRequestException('This conversation is closed. Please open a new one.');
    const attachmentKeys = await this.checkAttachments(dto.attachmentKeys, user.id);
    const now = new Date();
    const next: TicketStatus = t.assigneeId ? 'IN_PROGRESS' : 'OPEN';
    const reopened = t.status === 'RESOLVED';
    await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({ data: { ticketId: id, authorId: user.id, body: dto.body.trim(), attachmentKeys } });
      // A reply reopens the ticket for the team.
      // An assigned agent keeps it ("In progress"); otherwise it goes back to the shared queue.
      // The earlier resolution stays in the history (the "status" event that solved it).
      await tx.supportTicket.update({
        where: { id },
        data: { lastMessageAt: now, status: next, ...(reopened ? { resolvedAt: null, resolvedById: null, resolutionSummary: null, reopenCount: { increment: 1 } } : {}) },
      });
      await this.event(tx, id, user.id, 'person_reply');
      if (reopened) await this.event(tx, id, user.id, 'reopened', { from: t.status, to: next });
      else if (t.status !== next) await this.event(tx, id, null, 'status', { from: t.status, to: next });
    });
    await this.notifyStaff(t, `Reply on ticket ${this.ref(t.number)}`, dto.body.slice(0, 140));
    return this.mine(user, id);
  }

  /** The person says their problem is solved. */
  async markSolved(user: AuthUser, id: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t || t.userId !== user.id) throw new NotFoundException('Ticket not found');
    if (t.status === 'RESOLVED' || t.status === 'CLOSED') return this.mine(user, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: user.id, resolutionSummary: t.resolutionSummary ?? 'The person confirmed the problem is solved.' } });
      await this.event(tx, id, user.id, 'solved_by_person', { from: t.status, to: 'RESOLVED' });
    });
    await this.notifyStaff(t, `Ticket ${this.ref(t.number)} solved by the person`, t.subject);
    return this.mine(user, id);
  }

  // ── Staff ──

  async staffList(admin: AuthUser, q: StaffListQuery) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(!q.status || q.status === 'open' ? { status: { in: OPEN_STATUSES } } : q.status === 'all' ? {} : { status: q.status as TicketStatus }),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.assignee === 'me' ? { assigneeId: admin.id } : q.assignee === 'none' ? { assigneeId: null } : q.assignee ? { assigneeId: q.assignee } : {}),
      ...(q.q ? { OR: [{ subject: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } }, ...(/^#?\d+$/.test(q.q) ? [{ number: Number(q.q.replace('#', '')) }] : [])] } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where, ...paginate(q),
        orderBy: [{ status: 'asc' }, { priority: 'desc' }, { lastMessageAt: 'desc' }],
        include: { user: { select: { id: true, name: true, email: true } }, assignee: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { fromStaff: true, internal: true, createdAt: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
      this.counts(admin),
    ]);
    return { ...pageResult(rows.map(({ messages, ...t }) => ({ ...t, awaitingStaff: !!messages[0] && !messages[0].fromStaff })), total, q), counts };
  }

  async counts(admin?: AuthUser) {
    const [open, unassigned, urgent, mine, waitingUser] = await Promise.all([
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({ where: { status: { in: OPEN_STATUSES }, assigneeId: null } }),
      this.prisma.supportTicket.count({ where: { status: { in: OPEN_STATUSES }, priority: 'URGENT' } }),
      admin ? this.prisma.supportTicket.count({ where: { status: { in: OPEN_STATUSES }, assigneeId: admin.id } }) : 0,
      this.prisma.supportTicket.count({ where: { status: 'WAITING_USER' } }),
    ]);
    return { open, unassigned, urgent, mine, waitingUser };
  }

  async staffDetail(id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
        user: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true, professional: { select: { id: true, businessName: true } }, _count: { select: { supportTickets: true, requests: true, customerJobs: true } } } },
        assignee: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true, role: true } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true, role: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    const [job, request, payment] = await Promise.all([
      t.jobId ? this.prisma.job.findUnique({ where: { id: t.jobId }, select: { id: true, status: true, agreedPriceMinor: true, currency: true, paymentMethod: true, request: { select: { title: true } }, customer: { select: { id: true, name: true, email: true, phone: true } }, professional: { select: { businessName: true, user: { select: { id: true, name: true, email: true, phone: true } } } } } }) : null,
      t.requestId ? this.prisma.serviceRequest.findUnique({ where: { id: t.requestId }, select: { id: true, title: true, status: true } }) : null,
      t.paymentId ? this.prisma.payment.findUnique({ where: { id: t.paymentId }, select: { id: true, status: true, grossMinor: true, currency: true, method: true } }) : null,
    ]);
    return { ...this.shape(t, true), related: { job, request, payment } };
  }

  async staffReply(admin: AuthUser, id: string, dto: StaffReplyDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found');
    const attachmentKeys = await this.checkAttachments(dto.attachmentKeys, admin.id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({ data: { ticketId: id, authorId: admin.id, fromStaff: true, internal: !!dto.internal, body: dto.body.trim(), attachmentKeys } });
      await tx.supportTicket.update({
        where: { id },
        data: dto.internal
          ? { assigneeId: t.assigneeId ?? admin.id }
          : { lastMessageAt: now, status: 'WAITING_USER', assigneeId: t.assigneeId ?? admin.id, firstResponseAt: t.firstResponseAt ?? now },
      });
      await this.event(tx, id, admin.id, dto.internal ? 'note' : 'reply');
      if (!t.assigneeId) await this.event(tx, id, admin.id, 'assigned', { to: admin.id });
      if (!dto.internal && t.status !== 'WAITING_USER') await this.event(tx, id, admin.id, 'status', { from: t.status, to: 'WAITING_USER' });
    });
    await this.audit.log({ actorId: admin.id, action: dto.internal ? 'support.ticket.note' : 'support.ticket.reply', entityType: 'SupportTicket', entityId: id });
    if (!dto.internal) await this.tellPerson(t, `UNRET Support replied ${this.ref(t.number)}`, dto.body);
    return this.staffDetail(id);
  }

  async staffUpdate(admin: AuthUser, id: string, dto: StaffUpdateDto) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Ticket not found');
    let assigneeId: string | null | undefined = undefined;
    if (dto.assigneeId !== undefined) {
      assigneeId = dto.assigneeId === 'me' ? admin.id : dto.assigneeId || null;
      if (assigneeId) {
        const a = await this.prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true, adminRole: true } });
        if (!a || a.role !== 'ADMIN' || !hasAdminPermission(a.adminRole ?? 'OWNER', 'tickets.manage')) throw new BadRequestException('Tickets can only be assigned to staff who handle support');
      }
    }
    const statusChanged = !!dto.status && dto.status !== t.status;
    const resolving = statusChanged && (dto.status === 'RESOLVED' || dto.status === 'CLOSED');
    const resolution = dto.resolution?.trim();
    // The record must say how each problem ended.
    if (resolving && !resolution && !t.resolutionSummary) throw new BadRequestException('Write how the problem was solved before marking it solved or closed');
    const now = new Date();
    const data: Prisma.SupportTicketUpdateInput = {};
    if (statusChanged) {
      data.status = dto.status;
      if (resolving) {
        if (!t.resolvedAt) { data.resolvedAt = now; data.resolvedBy = { connect: { id: admin.id } }; }
        if (dto.status === 'CLOSED') data.closedAt = now;
      } else {
        // Back to work: it is open again.
        data.resolvedAt = null; data.closedAt = null; data.resolvedBy = { disconnect: true };
        if (t.status === 'RESOLVED' || t.status === 'CLOSED') data.reopenCount = { increment: 1 };
      }
    }
    if (resolution) data.resolutionSummary = resolution;
    if (dto.priority && dto.priority !== t.priority) data.priority = dto.priority;
    if (assigneeId !== undefined && assigneeId !== t.assigneeId) data.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true };
    const u = await this.prisma.$transaction(async (tx) => {
      const row = await tx.supportTicket.update({ where: { id }, data });
      if (statusChanged) await this.event(tx, id, admin.id, (t.status === 'RESOLVED' || t.status === 'CLOSED') && !resolving ? 'reopened' : 'status', { from: t.status, to: dto.status, note: resolving ? resolution ?? t.resolutionSummary : null });
      else if (resolution && resolution !== t.resolutionSummary) await this.event(tx, id, admin.id, 'resolution', { note: resolution });
      if (data.priority) await this.event(tx, id, admin.id, 'priority', { from: t.priority, to: dto.priority });
      if (data.assignee) await this.event(tx, id, admin.id, 'assigned', { from: t.assigneeId, to: assigneeId ?? null });
      return row;
    });
    await this.audit.log({ actorId: admin.id, action: 'support.ticket.update', entityType: 'SupportTicket', entityId: id, metadata: dto as object });
    if (dto.status === 'RESOLVED' && t.status !== 'RESOLVED') await this.tellPerson(u, `Your request ${this.ref(u.number)} was marked as solved`, `${resolution ?? ''}\n\nIf anything is still not right, just reply and the conversation opens again.`.trim());
    if (assigneeId && assigneeId !== admin.id && assigneeId !== t.assigneeId) await this.notifications.notify({ userId: assigneeId, type: 'SUPPORT_UPDATED', title: `Ticket ${this.ref(u.number)} was assigned to you`, body: u.subject, data: { ticketId: id, url: `/admin/support/${id}` } });
    return this.staffDetail(id);
  }

  // ── Problem register (the permanent record) ──

  private registerWhere(q: RegisterQuery): Prisma.SupportTicketWhereInput {
    const day = (s?: string, end = false) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T${end ? '23:59:59.999' : '00:00:00'}Z`) : undefined);
    const from = day(q.from), to = day(q.to, true);
    return {
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.status === 'open' ? { status: { in: OPEN_STATUSES } } : q.status === 'solved' ? { status: { in: ['RESOLVED', 'CLOSED'] as TicketStatus[] } } : q.status && q.status !== 'all' ? { status: q.status as TicketStatus } : {}),
      ...(q.q ? { OR: [{ subject: { contains: q.q, mode: 'insensitive' } }, { resolutionSummary: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } }, { messages: { some: { body: { contains: q.q, mode: 'insensitive' } } } }, ...(/^#?\d+$/.test(q.q) ? [{ number: Number(q.q.replace('#', '')) }] : [])] } : {}),
    };
  }

  private registerSelect = {
    id: true, number: true, kind: true, category: true, subject: true, status: true, priority: true, name: true, email: true,
    createdAt: true, firstResponseAt: true, resolvedAt: true, closedAt: true, resolutionSummary: true, reopenCount: true, jobId: true, paymentId: true, requestId: true,
    user: { select: { id: true, name: true, email: true } }, assignee: { select: { name: true } }, resolvedBy: { select: { name: true, role: true } },
    _count: { select: { messages: true } },
  } satisfies Prisma.SupportTicketSelect;

  /** Every problem ever reported (open or solved), with how and when it ended, plus totals for the period. */
  async register(q: RegisterQuery) {
    const where = this.registerWhere(q);
    const [rows, total, stats] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, ...paginate(q), orderBy: { createdAt: 'desc' }, select: this.registerSelect }),
      this.prisma.supportTicket.count({ where }),
      this.registerStats(where),
    ]);
    return { ...pageResult(rows, total, q), stats };
  }

  private async registerStats(where: Prisma.SupportTicketWhereInput) {
    const [byStatus, byCategory, times] = await Promise.all([
      this.prisma.supportTicket.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.supportTicket.groupBy({ by: ['category'], where, _count: true }),
      this.prisma.supportTicket.findMany({ where: { AND: [where, { OR: [{ firstResponseAt: { not: null } }, { resolvedAt: { not: null } }] }] }, select: { createdAt: true, firstResponseAt: true, resolvedAt: true, reopenCount: true }, take: 5000, orderBy: { createdAt: 'desc' } }),
    ]);
    const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3600e3;
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
    const count = (st: TicketStatus[]) => byStatus.filter((r) => st.includes(r.status)).reduce((s, r) => s + r._count, 0);
    return {
      total: byStatus.reduce((s, r) => s + r._count, 0),
      open: count(OPEN_STATUSES),
      solved: count(['RESOLVED', 'CLOSED']),
      reopened: times.filter((x) => x.reopenCount > 0).length,
      avgFirstResponseHours: avg(times.filter((x) => x.firstResponseAt).map((x) => hours(x.createdAt, x.firstResponseAt!))),
      avgResolutionHours: avg(times.filter((x) => x.resolvedAt).map((x) => hours(x.createdAt, x.resolvedAt!))),
      byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count])),
    };
  }

  /** The register as a spreadsheet (CSV, opens in Excel). Up to 20,000 rows per export. */
  async registerCsv(admin: AuthUser, q: RegisterQuery) {
    const rows = await this.prisma.supportTicket.findMany({ where: this.registerWhere(q), orderBy: { createdAt: 'desc' }, take: 20000, select: this.registerSelect });
    const cell = (v: unknown) => {
      if (v === null || v === undefined) return '';
      let s = v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 16) : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // never let a cell run as a formula in Excel
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['Number', 'Created', 'Kind', 'Category', 'Subject', 'From', 'Email', 'Priority', 'Status', 'Handled by', 'First reply', 'Solved', 'Closed', 'Solved by', 'How it was solved', 'Times reopened', 'Messages', 'Job', 'Payment'];
    const lines = rows.map((r) => [
      `#${r.number}`, r.createdAt, r.kind, r.category, r.subject, r.user?.name ?? r.name, r.user?.email ?? r.email, r.priority, r.status, r.assignee?.name,
      r.firstResponseAt, r.resolvedAt, r.closedAt, r.resolvedBy ? (r.resolvedBy.role === 'ADMIN' ? r.resolvedBy.name : 'The person') : '', r.resolutionSummary, r.reopenCount, r._count.messages, r.jobId, r.paymentId,
    ].map(cell).join(','));
    await this.audit.log({ actorId: admin.id, action: 'support.register.export', entityType: 'SupportTicket', metadata: { ...q, rows: rows.length } as object });
    return '\uFEFF' + [head.join(','), ...lines].join('\r\n');
  }

  /** The full record of one ticket as text: details, every message (including internal notes) and the history. */
  async transcript(admin: AuthUser, id: string) {
    const t = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } }, assignee: { select: { name: true } }, resolvedBy: { select: { name: true, role: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
        events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    const d = (x: Date | null) => (x ? x.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—');
    const out = [
      `UNRET — support record ${this.ref(t.number)}`, `Exported ${d(new Date())}`, '',
      `Subject:        ${t.subject}`, `Kind/category:  ${t.kind} / ${t.category}`, `From:           ${t.user?.name ?? t.name ?? '—'} <${t.user?.email ?? t.email ?? '—'}>`,
      `Status:         ${t.status} (priority ${t.priority})`, `Handled by:     ${t.assignee?.name ?? '—'}`,
      `Created:        ${d(t.createdAt)}`, `First reply:    ${d(t.firstResponseAt)}`, `Solved:         ${d(t.resolvedAt)}${t.resolvedBy ? ` by ${t.resolvedBy.role === 'ADMIN' ? t.resolvedBy.name : 'the person'}` : ''}`, `Closed:         ${d(t.closedAt)}`,
      `Reopened:       ${t.reopenCount} time(s)`, ...(t.jobId ? [`Job:            ${t.jobId}`] : []), ...(t.paymentId ? [`Payment:        ${t.paymentId}`] : []),
      '', 'HOW IT WAS SOLVED', t.resolutionSummary ?? '(not solved yet)', '', 'CONVERSATION',
      ...t.messages.flatMap((m) => [`--- ${d(m.createdAt)} · ${m.internal ? 'INTERNAL NOTE · ' : ''}${m.fromStaff ? `Staff: ${m.author?.name ?? '—'}` : m.author?.name ?? t.name ?? 'Person'}`, m.body, ...m.attachmentKeys.map((k) => `[attachment] ${k.split('/').pop()}`), '']),
      'HISTORY', ...t.events.map((e) => `${d(e.createdAt)}  ${e.type}${e.fromValue || e.toValue ? ` ${e.fromValue ?? ''} → ${e.toValue ?? ''}` : ''}${e.actor ? ` · ${e.actor.name}` : ''}${e.note ? ` · "${e.note}"` : ''}`),
    ];
    await this.audit.log({ actorId: admin.id, action: 'support.ticket.export', entityType: 'SupportTicket', entityId: id });
    return out.join('\n');
  }

  /** Solved tickets with no new message for AUTO_CLOSE_DAYS are closed (they stay in the register forever). */
  async autoClose() {
    const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 864e5);
    const rows = await this.prisma.supportTicket.findMany({ where: { status: 'RESOLVED', resolvedAt: { lt: cutoff }, lastMessageAt: { lt: cutoff } }, select: { id: true }, take: 500 });
    for (const r of rows) {
      await this.prisma.$transaction(async (tx) => {
        await tx.supportTicket.update({ where: { id: r.id }, data: { status: 'CLOSED', closedAt: new Date() } });
        await this.event(tx, r.id, null, 'auto_closed', { from: 'RESOLVED', to: 'CLOSED', note: `No new messages for ${AUTO_CLOSE_DAYS} days` });
      });
    }
    return rows.length;
  }

  /**
   * A ticket opened by UNRET itself (no person wrote it), e.g. a payment nobody confirmed after the reminders.
   * The body is the filled-in form; staff see it in the inbox and the problem register.
   */
  async createAutomatic(input: { category: (typeof CATEGORIES)[number]; subject: string; body: string; priority?: TicketPriority; jobId?: string; paymentId?: string }) {
    const t = await this.prisma.supportTicket.create({
      data: {
        name: 'UNRET automatic check', kind: 'automatic', category: input.category, subject: input.subject.slice(0, 140), priority: input.priority ?? 'HIGH',
        jobId: input.jobId ?? null, paymentId: input.paymentId ?? null,
        messages: { create: { body: input.body, fromStaff: true, internal: true } },
      },
    });
    await this.event(this.prisma, t.id, null, 'created', { to: t.category, note: 'Opened automatically by UNRET' });
    await this.audit.log({ actorId: null, action: 'support.ticket.create_automatic', entityType: 'SupportTicket', entityId: t.id, metadata: { number: t.number, jobId: input.jobId } });
    await this.notifyStaff(t, `Automatic check ${this.ref(t.number)}: ${t.subject}`, 'Opened by UNRET — needs someone from the team.');
    return t;
  }

  /** Adds a note from UNRET to an automatic ticket and, optionally, marks it solved (e.g. the payment was confirmed later). */
  async systemNote(ticketId: string, body: string, resolve?: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!t) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({ data: { ticketId, body, fromStaff: true, internal: true } });
      await this.event(tx, ticketId, null, 'note', { note: body.slice(0, 300) });
      if (resolve && !['RESOLVED', 'CLOSED'].includes(t.status)) {
        await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'RESOLVED', resolvedAt: now, resolutionSummary: t.resolutionSummary ?? resolve } });
        await this.event(tx, ticketId, null, 'status', { from: t.status, to: 'RESOLVED', note: resolve });
      }
    });
    await this.notifyStaff(t, `Update on ${this.ref(t.number)}`, body.slice(0, 140));
  }

  /** In-app + push + email for people with an account; email for guests. */
  private async tellPerson(t: { id: string; number: number; userId: string | null; email: string | null; name: string | null; subject: string }, title: string, body: string) {
    if (t.userId) {
      await this.notifications.notify({ userId: t.userId, type: 'SUPPORT_UPDATED', title, body: body.slice(0, 300), data: { ticketId: t.id, url: `/help/tickets/${t.id}` } });
      this.realtime.emitToUser(t.userId, 'support', { ticketId: t.id });
    } else if (t.email) {
      await this.email.send({ to: t.email, subject: `${title} — ${t.subject}`, body: `Hi ${t.name ?? ''},\n\n${body}\n\nReply to this email or contact us again on unret.ro.` }).catch((e) => this.log.warn((e as Error).message));
    }
  }
}

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private s: SupportService) {}

  @Post('tickets')
  create(@CurrentUser() u: AuthUser, @Body() dto: NewTicketDto) {
    return this.s.create(u, dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('contact')
  contact(@Body() dto: GuestContactDto) {
    return this.s.guestContact(dto);
  }

  @Get('tickets')
  mine(@CurrentUser() u: AuthUser, @Query() q: PageQuery) {
    return this.s.myTickets(u, q);
  }

  @Get('tickets/:id')
  one(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.s.mine(u, id);
  }

  @Post('tickets/:id/messages')
  reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.s.reply(u, id, dto);
  }

  @Post('tickets/:id/solved')
  solved(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.s.markSolved(u, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/support')
export class AdminSupportController {
  constructor(private s: SupportService) {}

  @Permission('tickets.manage')
  @Get('tickets')
  list(@CurrentUser() u: AuthUser, @Query() q: StaffListQuery) {
    return this.s.staffList(u, q);
  }

  @Permission('tickets.manage', 'audit.view')
  @Get('register')
  register(@Query() q: RegisterQuery) {
    return this.s.register(q);
  }

  @Permission('tickets.manage', 'audit.view')
  @Get('register.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="unret-support-register.csv"')
  registerCsv(@CurrentUser() u: AuthUser, @Query() q: RegisterQuery) {
    return this.s.registerCsv(u, q);
  }

  @Permission('tickets.manage', 'audit.view')
  @Get('tickets/:id/record')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  record(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.s.transcript(u, id);
  }

  @Permission('tickets.manage')
  @Get('tickets/:id')
  one(@Param('id') id: string) {
    return this.s.staffDetail(id);
  }

  @Permission('tickets.manage')
  @Post('tickets/:id/messages')
  reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StaffReplyDto) {
    return this.s.staffReply(u, id, dto);
  }

  @Permission('tickets.manage')
  @Patch('tickets/:id')
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: StaffUpdateDto) {
    return this.s.staffUpdate(u, id, dto);
  }
}

@Global()
@Module({ controllers: [SupportController, AdminSupportController], providers: [SupportService], exports: [SupportService] })
export class SupportModule {}
