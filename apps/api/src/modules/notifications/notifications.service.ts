import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma } from '@prisma/client';
import { ESSENTIAL_NOTIFICATIONS, NotificationType } from '@unret/shared';
import { PrismaService } from '../../common/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { EmailChannel, PushChannel, SmsChannel } from './channels';
import { QueueService } from './queue.service';

/** Events important enough to send by SMS where the user enabled it. */
const SMS_ELIGIBLE: NotificationType[] = ['OFFER_ACCEPTED', 'JOB_CANCELLED', 'APPOINTMENT_APPROACHING'];

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Groups repeated events into one unread notification (e.g. several messages in one conversation). */
  collapse?: { key: string; title: (count: number) => string };
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private log = new Logger(NotificationsService.name);
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private queue: QueueService,
    private email: EmailChannel,
    private push: PushChannel,
    private sms: SmsChannel,
  ) {}

  onModuleInit() {
    this.queue.register('notification-delivery', (d) => this.deliver(d));
  }

  /** Creates the in-app notification immediately; external channels are delivered by a background worker. */
  async notify(input: NotifyInput) {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: input.userId, type: input.type } },
    });
    const essential = ESSENTIAL_NOTIFICATIONS.includes(input.type);
    const inApp = essential || (pref?.inApp ?? true);

    let title = input.title;
    let grouped = false;
    if (inApp) {
      const existing = input.collapse
        ? await this.prisma.notification.findFirst({ where: { userId: input.userId, type: input.type, readAt: null, data: { path: ['collapse'], equals: input.collapse.key } }, orderBy: { createdAt: 'desc' } })
        : null;
      const data = { ...(input.data ?? {}), type: input.type, ...(input.collapse ? { collapse: input.collapse.key } : {}) };
      let n;
      if (existing) {
        const count = (Number((existing.data as any)?.count) || 1) + 1;
        title = input.collapse!.title(count);
        grouped = true;
        n = await this.prisma.notification.update({ where: { id: existing.id }, data: { title, body: input.body, createdAt: new Date(), data: { ...data, count } as Prisma.InputJsonValue } });
      } else {
        n = await this.prisma.notification.create({ data: { userId: input.userId, type: input.type, title, body: input.body, data: { ...data, count: 1 } as Prisma.InputJsonValue } });
      }
      this.realtime.emitToUser(input.userId, 'notification', { ...n, grouped });
    }
    const { collapse: _c, ...plain } = input;
    await this.queue.add('notification-delivery', {
      ...plain,
      title,
      data: { ...(input.data ?? {}), type: input.type },
      // A follow-up in an already-unread group still pushes, but does not send another email.
      email: !grouped && (essential || (pref?.email ?? true)),
      push: essential || (pref?.push ?? true),
      sms: SMS_ELIGIBLE.includes(input.type) && (pref?.sms ?? false),
    });
  }

  async notifyMany(userIds: string[], base: Omit<NotifyInput, 'userId'>) {
    for (const userId of userIds) await this.notify({ ...base, userId });
  }

  // ── Email links ──

  /** The website's public address (links in emails). */
  webBase() {
    return (process.env.PUBLIC_WEB_URL || (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0]).trim().replace(/\/$/, '');
  }

  private secret() {
    return process.env.FILE_SIGNING_SECRET || process.env.JWT_ACCESS_SECRET || 'unret';
  }

  /** Signed token for the one-click "turn off email notifications" link (works without signing in, cannot be forged). */
  unsubscribeToken(userId: string) {
    return `${userId}.${createHmac('sha256', this.secret()).update(`unsubscribe:${userId}`).digest('base64url')}`;
  }

  verifyUnsubscribeToken(token: string): string | null {
    const [userId, sig] = String(token ?? '').split('.');
    if (!userId || !sig) return null;
    const expected = Buffer.from(this.unsubscribeToken(userId).split('.')[1]);
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
  }

  emailLinks(userId: string, url?: unknown) {
    const web = this.webBase();
    const api = (process.env.PUBLIC_API_URL || `${web}`).replace(/\/$/, '') + '/api/v1';
    const token = this.unsubscribeToken(userId);
    return {
      actionUrl: typeof url === 'string' && url.startsWith('/') ? web + url : null,
      manageUrl: `${web}/settings#notifications`,
      unsubscribePageUrl: `${web}/unsubscribe?token=${encodeURIComponent(token)}`,
      unsubscribePostUrl: `${api}/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
    };
  }

  /** Sends one sample email so people can check that emails reach them (and how they look). */
  async sendTestEmail(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, preferredLanguage: true } });
    if (!user.email) return { sent: false, reason: 'no_email' };
    const ro = user.preferredLanguage === 'ro';
    await this.email.send({
      to: user.email, locale: user.preferredLanguage,
      subject: ro ? 'Emailurile UNRET funcționează' : 'UNRET emails are working',
      body: ro ? 'Așa vor arăta notificările prin email: cereri noi, oferte, mesaje și altele. Le poți opri oricând din setări.' : 'This is how email notifications will look: new requests, offers, messages and more. You can turn them off at any time in your settings.',
      ...this.emailLinks(userId, '/notifications'),
    });
    return { sent: true, to: user.email, delivered: this.email.configured };
  }

  private async deliver(d: NotifyInput & { email: boolean; push: boolean; sms: boolean }) {
    const user = await this.prisma.user.findUnique({
      where: { id: d.userId },
      select: { email: true, phone: true, status: true, emailNotifications: true, preferredLanguage: true, pushDevices: { select: { token: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return;
    const msg = { subject: d.title, body: d.body, data: d.data };
    // Email: the person's master switch, then their choice for this type of notification.
    if (d.email && user.email && user.emailNotifications) {
      await this.email
        .send({ to: user.email, ...msg, locale: user.preferredLanguage, ...this.emailLinks(d.userId, d.data?.url) })
        .catch((e) => this.log.warn(`Email to user ${d.userId} failed: ${(e as Error).message}`));
    }
    if (d.push) {
      for (const dev of user.pushDevices) {
        // One phone failing must not stop the others (or email/SMS).
        await this.push.send({ to: dev.token, ...msg }).catch((e) => this.log.warn((e as Error).message));
      }
    }
    if (d.sms && user.phone) await this.sms.send({ to: user.phone, ...msg });
  }
}
