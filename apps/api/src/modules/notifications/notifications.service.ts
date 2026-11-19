import { Injectable, OnModuleInit } from '@nestjs/common';
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
}

@Injectable()
export class NotificationsService implements OnModuleInit {
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

    if (inApp) {
      const n = await this.prisma.notification.create({
        data: { userId: input.userId, type: input.type, title: input.title, body: input.body, data: (input.data ?? {}) as Prisma.InputJsonValue },
      });
      this.realtime.emitToUser(input.userId, 'notification', n);
    }
    await this.queue.add('notification-delivery', {
      ...input,
      email: essential || (pref?.email ?? true),
      push: essential || (pref?.push ?? true),
      sms: SMS_ELIGIBLE.includes(input.type) && (pref?.sms ?? false),
    });
  }

  async notifyMany(userIds: string[], base: Omit<NotifyInput, 'userId'>) {
    for (const userId of userIds) await this.notify({ ...base, userId });
  }

  private async deliver(d: NotifyInput & { email: boolean; push: boolean; sms: boolean }) {
    const user = await this.prisma.user.findUnique({
      where: { id: d.userId },
      select: { email: true, phone: true, status: true, pushDevices: { select: { token: true } } },
    });
    if (!user || user.status !== 'ACTIVE') return;
    const msg = { subject: d.title, body: d.body, data: d.data };
    if (d.email && user.email) await this.email.send({ to: user.email, ...msg });
    if (d.push) for (const dev of user.pushDevices) await this.push.send({ to: dev.token, ...msg });
    if (d.sms && user.phone) await this.sms.send({ to: user.phone, ...msg });
  }
}
