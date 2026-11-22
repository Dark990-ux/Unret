import { Injectable, Logger } from '@nestjs/common';
import { Locale, translate } from '@unret/shared';
import { createTransport, Transporter } from 'nodemailer';
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
export interface EmailMessage extends OutboundMessage {
  locale?: string;
  /** Absolute link for the main button ("Open in UNRET"). */
  actionUrl?: string | null;
  /** One-click unsubscribe page (shown in the footer) and its RFC 8058 POST endpoint. */
  unsubscribePageUrl?: string;
  unsubscribePostUrl?: string;
  manageUrl?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Branded HTML + plain-text email for a notification. Inline styles only (email clients ignore stylesheets). */
export function renderNotificationEmail(m: EmailMessage) {
  const tr = (s: string) => translate((m.locale as Locale) ?? 'ro', s);
  const button = m.actionUrl
    ? `<tr><td style="padding:8px 32px 28px"><a href="${esc(m.actionUrl)}" style="display:inline-block;background:#ffc83d;color:#1b1a3a;font-weight:700;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:12px">${esc(tr('Open in UNRET'))} →</a></td></tr>`
    : '';
  const footer = [
    m.manageUrl ? `<a href="${esc(m.manageUrl)}" style="color:#5b5e8c">${esc(tr('Notification settings'))}</a>` : '',
    m.unsubscribePageUrl ? `<a href="${esc(m.unsubscribePageUrl)}" style="color:#5b5e8c">${esc(tr('Turn off email notifications'))}</a>` : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const html = `<!doctype html><html lang="${esc(m.locale ?? 'ro')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(m.subject)}</title></head>
<body style="margin:0;background:#f4f4fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1a3a">
<span style="display:none;max-height:0;overflow:hidden">${esc(m.body.slice(0, 140))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e4e4f2">
<tr><td style="background:#2b2fd6;padding:18px 32px"><span style="display:inline-block;background:#ffffff;color:#2b2fd6;font-weight:800;border-radius:8px;padding:2px 8px;margin-right:8px">U</span><span style="color:#ffffff;font-weight:700;font-size:18px;letter-spacing:.5px">UNRET</span><span style="color:#ffc83d"> ✦</span></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 10px;font-size:20px;line-height:1.3">${esc(m.subject)}</h1><p style="margin:0;font-size:15px;line-height:1.55;color:#3d3f66;white-space:pre-line">${esc(m.body)}</p></td></tr>
${button}
<tr><td style="padding:16px 32px 24px;border-top:1px solid #eeeef7;font-size:12px;line-height:1.5;color:#7a7c9e">${esc(tr('You get this email because you have an UNRET account.'))}<br>${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [m.subject, '', m.body, ...(m.actionUrl ? ['', `${tr('Open in UNRET')}: ${m.actionUrl}`] : []), '', '—', tr('You get this email because you have an UNRET account.'), ...(m.unsubscribePageUrl ? [`${tr('Turn off email notifications')}: ${m.unsubscribePageUrl}`] : [])].join('\n');
  return { html, text };
}

/**
 * Email over SMTP, which works with almost any email service (Brevo, SendGrid, Postmark, Amazon SES, Mailgun,
 * Gmail/Google Workspace…). Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.
 * Without SMTP_HOST, emails are only written to the log (development).
 */
@Injectable()
export class EmailChannel {
  private log = new Logger('EmailChannel');
  private transport: Transporter | null = null;
  readonly configured = !!process.env.SMTP_HOST;

  private getTransport() {
    if (!this.transport && process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT) || 587;
      this.transport = createTransport({
        host: process.env.SMTP_HOST, port, secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    return this.transport;
  }

  async send(m: EmailMessage) {
    const transport = this.getTransport();
    if (!transport) {
      this.log.log(`→ ${m.to}: ${m.subject}`);
      return;
    }
    const { html, text } = renderNotificationEmail(m);
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || 'UNRET <no-reply@unret.ro>',
      to: m.to, subject: m.subject, html, text,
      headers: m.unsubscribePostUrl ? { 'List-Unsubscribe': `<${m.unsubscribePostUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
    });
    this.log.log(`→ ${m.to}: ${m.subject} (${info.messageId})`);
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
