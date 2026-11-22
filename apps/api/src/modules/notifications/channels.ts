import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Delivery channel adapters. Development implementations log to the console;
 * production replaces these with an email provider (e.g. SES/Postmark),
 * push (Expo Push / FCM / APNs) and SMS (e.g. Twilio) without touching callers.
 */
@Injectable()
export class EmailChannel {
  private log = new Logger('EmailChannel');
  async send(m: OutboundMessage) {
    this.log.log(`→ ${m.to}: ${m.subject}`);
  }
}

/**
 * Push notifications to phones through Expo's push service (which forwards to Apple APNs / Google FCM).
 * Devices register an "ExponentPushToken[…]" from the app; other tokens are only logged (development).
 * Optional EXPO_ACCESS_TOKEN enables Expo's enhanced push security.
 */
@Injectable()
export class PushChannel {
  private log = new Logger('PushChannel');
  constructor(private prisma: PrismaService) {}

  async send(m: OutboundMessage) {
    if (!/^Expo(nent)?PushToken\[/.test(m.to) || process.env.PUSH_PROVIDER === 'log') {
      this.log.log(`→ device ${m.to.slice(0, 12)}…: ${m.subject}`);
      return;
    }
    const res = await fetch(process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify({ to: m.to, title: m.subject, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high', channelId: 'default' }),
    });
    const out = (await res.json().catch(() => null)) as { data?: { status: string; message?: string; details?: { error?: string } } } | null;
    const ticket = out?.data;
    if (!res.ok || ticket?.status === 'error') {
      // The app was uninstalled or the token expired: stop sending to it.
      if (ticket?.details?.error === 'DeviceNotRegistered') await this.prisma.pushDevice.deleteMany({ where: { token: m.to } });
      throw new Error(`Expo push failed: ${ticket?.message ?? res.status}`);
    }
  }
}

@Injectable()
export class SmsChannel {
  private log = new Logger('SmsChannel');
  async send(m: OutboundMessage) {
    this.log.log(`→ ${m.to}: ${m.subject}`);
  }
}
