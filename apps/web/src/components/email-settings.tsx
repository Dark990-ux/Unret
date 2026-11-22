'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { Alert, Button, cx } from './ui';

/** Master switch for notification emails + a test email. */
export function EmailNotificationsSwitch({ onChange }: { onChange?: (enabled: boolean) => void }) {
  const { t } = useT();
  const q = useApi<{ enabled: boolean; email: string | null; serviceConnected: boolean }>('/notifications/email');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  if (!q.data) return null;
  const on = q.data.enabled;
  const toggle = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api<any>('/notifications/email', { method: 'PUT', body: { enabled: !on } }); q.setData(r); onChange?.(r.enabled); }
    catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api<any>('/notifications/email/test', { method: 'POST' }); setMsg(r.sent ? { tone: 'green', text: t('Test email sent to {email}. Check your inbox (and spam folder).', { email: r.to }) } : { tone: 'red', text: t('Add an email address to your account first') }); }
    catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(false); }
  };
  return (
    <div className="mb-5 space-y-3 rounded-xl border border-surface-line p-4 dark:border-white/15" data-testid="email-switch">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium text-ink dark:text-white"><Mail className="h-4 w-4" />{t('Email notifications')}</div>
          <div className="text-sm text-ink-muted">{on ? t('We email you about new requests, offers, messages and other updates at {email}.', { email: q.data.email ?? '—' }) : t('Emails are off. You still get notifications in the app and on your phone.')}</div>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={t('Email notifications')} disabled={busy} onClick={toggle}
          className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-brand-700' : 'bg-surface-line dark:bg-white/20')}>
          <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-6' : 'left-1')} />
        </button>
      </div>
      {on && <Button size="sm" variant="outline" loading={busy} onClick={test}>{t('Send me a test email')}</Button>}
      {!q.data.serviceConnected && <p className="text-xs text-ink-muted">{t('Test mode: no email service is connected, so emails are only recorded by the server.')}</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
