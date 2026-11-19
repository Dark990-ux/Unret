import { Injectable, Logger } from '@nestjs/common';

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

@Injectable()
export class PushChannel {
  private log = new Logger('PushChannel');
  async send(m: OutboundMessage) {
    this.log.log(`→ device ${m.to.slice(0, 12)}…: ${m.subject}`);
  }
}

@Injectable()
export class SmsChannel {
  private log = new Logger('SmsChannel');
  async send(m: OutboundMessage) {
    this.log.log(`→ ${m.to}: ${m.subject}`);
  }
}
