import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma.service';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

  /** One conversation per (request, customer, professional); request-less threads are also unique per pair. */
  async ensure(input: { requestId?: string | null; customerId: string; professionalId: string; jobId?: string | null }, tx: Tx = this.prisma) {
    const existing = await tx.conversation.findFirst({
      where: { requestId: input.requestId ?? null, customerId: input.customerId, professionalId: input.professionalId },
    });
    if (existing) {
      if (input.jobId && !existing.jobId) return tx.conversation.update({ where: { id: existing.id }, data: { jobId: input.jobId } });
      return existing;
    }
    return tx.conversation.create({ data: { requestId: input.requestId ?? null, customerId: input.customerId, professionalId: input.professionalId, jobId: input.jobId ?? null } });
  }

  /** Customer contacts a professional (optionally about a request), or a matched professional asks the customer for clarification. */
  async start(user: AuthUser, dto: { professionalId?: string; requestId?: string }) {
    if (dto.requestId) {
      const req = await this.prisma.serviceRequest.findUnique({ where: { id: dto.requestId } });
      if (!req) throw new NotFoundException('Request not found');
      if (req.customerId === user.id) {
        if (!dto.professionalId) throw new BadRequestException('professionalId is required');
        const involved = await this.prisma.requestMatch.findFirst({ where: { requestId: req.id, professionalId: dto.professionalId, notifiedAt: { not: null } } })
          ?? await this.prisma.offer.findFirst({ where: { requestId: req.id, professionalId: dto.professionalId } });
        if (!involved) throw new ForbiddenException('This professional is not involved in your request');
        return this.ensure({ requestId: req.id, customerId: user.id, professionalId: dto.professionalId });
      }
      if (!user.professionalId) throw new ForbiddenException();
      const match = await this.prisma.requestMatch.findFirst({ where: { requestId: req.id, professionalId: user.professionalId, notifiedAt: { not: null } } });
      if (!match) throw new ForbiddenException('You were not matched with this request');
      return this.ensure({ requestId: req.id, customerId: req.customerId, professionalId: user.professionalId });
    }
    if (!dto.professionalId) throw new BadRequestException('professionalId is required');
    const pro = await this.prisma.professionalProfile.findUnique({ where: { id: dto.professionalId } });
    if (!pro || pro.visibility === 'HIDDEN') throw new NotFoundException('Professional not found');
    if (pro.userId === user.id) throw new BadRequestException('You cannot message yourself');
    return this.ensure({ customerId: user.id, professionalId: pro.id });
  }

  async assertParticipant(conversationId: string, user: AuthUser) {
    const c = await this.prisma.conversation.findUnique({ where: { id: conversationId }, include: { professional: { select: { userId: true } } } });
    if (!c) throw new NotFoundException('Conversation not found');
    const isCustomer = c.customerId === user.id;
    const isPro = c.professional.userId === user.id;
    if (!isCustomer && !isPro && user.role !== 'ADMIN') throw new ForbiddenException();
    return { c, isCustomer, isPro, otherUserId: isCustomer ? c.professional.userId : c.customerId };
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ customerId: user.id }, ...(user.professionalId ? [{ professionalId: user.professionalId }] : [])] },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        customer: { select: { id: true, name: true, avatarKey: true } },
        professional: { select: { id: true, userId: true, businessName: true, user: { select: { name: true, avatarKey: true } } } },
        request: { select: { id: true, title: true } },
        job: { select: { id: true, status: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return Promise.all(
      rows.map(async (c) => {
        const asCustomer = c.customerId === user.id;
        const lastRead = asCustomer ? c.customerLastReadAt : c.professionalLastReadAt;
        const unread = await this.prisma.message.count({
          where: { conversationId: c.id, senderId: { not: user.id }, ...(lastRead ? { createdAt: { gt: lastRead } } : {}) },
        });
        return {
          id: c.id,
          role: asCustomer ? 'customer' : 'professional',
          counterpart: asCustomer
            ? { name: c.professional.businessName ?? c.professional.user.name, avatarUrl: this.storage.signedUrl(c.professional.user.avatarKey), professionalId: c.professional.id }
            : { name: c.customer.name, avatarUrl: this.storage.signedUrl(c.customer.avatarKey) },
          request: c.request,
          job: c.job,
          lastMessage: c.messages[0] ? { body: c.messages[0].body, kind: c.messages[0].kind, createdAt: c.messages[0].createdAt, mine: c.messages[0].senderId === user.id } : null,
          lastMessageAt: c.lastMessageAt,
          unread,
        };
      }),
    );
  }

  async messages(conversationId: string, user: AuthUser, before?: string) {
    const { c, isCustomer } = await this.assertParticipant(conversationId, user);
    const items = await this.prisma.message.findMany({
      where: { conversationId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sender: { select: { id: true, name: true } } },
    });
    await this.markRead(conversationId, isCustomer);
    const full = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: c.id },
      include: {
        customer: { select: { id: true, name: true } },
        professional: { select: { id: true, businessName: true, user: { select: { id: true, name: true } } } },
        request: { select: { id: true, title: true, status: true } },
        job: { select: { id: true, status: true } },
      },
    });
    return {
      conversation: full,
      messages: items.reverse().map((m) => ({ ...m, attachmentUrl: this.storage.signedUrl(m.attachmentKey), mine: m.senderId === user.id })),
    };
  }

  async send(conversationId: string, user: AuthUser, body: string, attachmentKey?: string) {
    const { isCustomer, otherUserId } = await this.assertParticipant(conversationId, user);
    if (!body?.trim() && !attachmentKey) throw new BadRequestException('Message is empty');
    let attachmentName: string | undefined;
    let attachmentMime: string | undefined;
    if (attachmentKey) {
      this.storage.assertOwned(attachmentKey, user.id, 'message');
      attachmentName = attachmentKey.split('/').pop();
      attachmentMime = /\.pdf$/i.test(attachmentKey) ? 'application/pdf' : 'image';
    }
    const now = new Date();
    const msg = await this.prisma.message.create({
      data: { conversationId, senderId: user.id, body: body?.trim() ?? '', attachmentKey, attachmentName, attachmentMime },
      include: { sender: { select: { id: true, name: true } } },
    });
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, ...(isCustomer ? { customerLastReadAt: now } : { professionalLastReadAt: now }) },
    });
    const payload = { ...msg, attachmentUrl: this.storage.signedUrl(msg.attachmentKey) };
    this.realtime.emitToUser(otherUserId, 'message', { ...payload, mine: false });
    this.realtime.emitToUser(user.id, 'message', { ...payload, mine: true });
    await this.notifications.notify({
      userId: otherUserId,
      type: 'NEW_MESSAGE',
      title: `New message from ${msg.sender?.name ?? 'UNRET'}`,
      body: msg.body.slice(0, 140) || 'Attachment',
      data: { conversationId, url: `/messages/${conversationId}` },
    });
    return payload;
  }

  /** System messages record offer/job events inside the relevant conversation. */
  async system(conversationId: string, body: string, tx: Tx = this.prisma) {
    const msg = await tx.message.create({ data: { conversationId, kind: 'SYSTEM', body } });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return msg;
  }

  private markRead(conversationId: string, isCustomer: boolean) {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: isCustomer ? { customerLastReadAt: new Date() } : { professionalLastReadAt: new Date() },
    });
  }
}
