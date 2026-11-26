import { BadRequestException, Body, Controller, ForbiddenException, Get, Global, Injectable, Logger, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
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

const KINDS = ['question', 'problem', 'contact'] as const;
const CATEGORIES = ['account', 'payments', 'job', 'technical', 'safety', 'suggestion', 'other'] as const;

class NewTicketDto {
  @IsIn(KINDS) kind: (typeof KINDS)[number];
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
}
class StaffListQuery extends PageQuery {
  @IsOptional() @IsString() status?: string; // open (default) | all | <TicketStatus>
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: TicketPriority;
  @IsOptional() @IsString() assignee?: string; // me | none | <id>
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'];
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
    await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { ticketId: id, authorId: user.id, body: dto.body.trim(), attachmentKeys } }),
      // A reply reopens the ticket for the team.
      // An assigned agent keeps it ("In progress"); otherwise it goes back to the shared queue.
      this.prisma.supportTicket.update({ where: { id }, data: { lastMessageAt: now, status: t.assigneeId ? 'IN_PROGRESS' : 'OPEN', resolvedAt: null } }),
    ]);
    await this.notifyStaff(t, `Reply on ticket ${this.ref(t.number)}`, dto.body.slice(0, 140));
    return this.mine(user, id);
  }

  /** The person says their problem is solved. */
  async markSolved(user: AuthUser, id: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t || t.userId !== user.id) throw new NotFoundException('Ticket not found');
    await this.prisma.supportTicket.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
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
      },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    const [job, request, payment] = await Promise.all([
      t.jobId ? this.prisma.job.findUnique({ where: { id: t.jobId }, select: { id: true, status: true, agreedPriceMinor: true, currency: true, request: { select: { title: true } } } }) : null,
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
    await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { ticketId: id, authorId: admin.id, fromStaff: true, internal: !!dto.internal, body: dto.body.trim(), attachmentKeys } }),
      this.prisma.supportTicket.update({
        where: { id },
        data: dto.internal
          ? { assigneeId: t.assigneeId ?? admin.id }
          : { lastMessageAt: now, status: 'WAITING_USER', assigneeId: t.assigneeId ?? admin.id },
      }),
    ]);
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
    const resolved = dto.status === 'RESOLVED' || dto.status === 'CLOSED';
    const u = await this.prisma.supportTicket.update({
      where: { id },
      data: { ...(dto.status ? { status: dto.status, resolvedAt: resolved ? new Date() : null } : {}), ...(dto.priority ? { priority: dto.priority } : {}), ...(assigneeId !== undefined ? { assigneeId } : {}) },
    });
    await this.audit.log({ actorId: admin.id, action: 'support.ticket.update', entityType: 'SupportTicket', entityId: id, metadata: dto as object });
    if (dto.status === 'RESOLVED' && t.status !== 'RESOLVED') await this.tellPerson(u, `Your request ${this.ref(u.number)} was marked as solved`, 'If anything is still not right, just reply and the conversation opens again.');
    if (assigneeId && assigneeId !== admin.id && assigneeId !== t.assigneeId) await this.notifications.notify({ userId: assigneeId, type: 'SUPPORT_UPDATED', title: `Ticket ${this.ref(u.number)} was assigned to you`, body: u.subject, data: { ticketId: id, url: `/admin/support/${id}` } });
    return this.staffDetail(id);
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
