'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { Alert, Button, cx } from './ui';

export const NOTIF_ICON: Record<string, string> = {
  NEW_MATCHING_REQUEST: '📥', NEW_OFFER: '📝', OFFER_REVISED: '📝', OFFER_ACCEPTED: '🤝', OFFER_REJECTED: '📝', OFFER_MODIFICATION_REQUESTED: '✏️',
  NEW_MESSAGE: '💬', APPOINTMENT_APPROACHING: '⏰', JOB_STATUS_CHANGED: '🔧', JOB_CHANGE_PROPOSED: '✏️', JOB_CANCELLED: '✖️',
  PAYMENT_COMPLETED: '💳', PAYMENT_TO_CONFIRM: '💳', REVIEW_RECEIVED: '⭐', VERIFICATION_UPDATED: '🛡️', DISPUTE_UPDATED: '⚖️', AVAILABILITY_OPENED: '🔔', PLAN_LIMIT_REACHED: '📈', SUBSCRIPTION_UPDATED: '👑',
};

type Toast = { id: string; type: string; title: string; body: string; url?: string };

/**
 * Pop-up for notifications that arrive while the site is open, plus a system (desktop) notification
 * when the tab is in the background and the person allowed it. Messages for the chat you are reading are skipped.
 */
export function NotificationToasts() {
  const { me } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: string) => { setToasts((l) => l.filter((x) => x.id !== id)); clearTimeout(timers.current.get(id)); }, []);

  useRealtime<any>('notification', (n) => {
    const url: string | undefined = n.data?.url;
    if (n.type === 'NEW_MESSAGE' && url && pathname === url && !document.hidden) return; // already reading it
    const toast: Toast = { id: n.id, type: n.type, title: n.title, body: n.body, url };
    setToasts((l) => [toast, ...l.filter((x) => x.id !== n.id)].slice(0, 3));
    clearTimeout(timers.current.get(n.id));
    timers.current.set(n.id, setTimeout(() => dismiss(n.id), 7000));
    if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const sys = new Notification(n.title, { body: n.body, tag: n.data?.collapse ?? n.id, icon: '/icon.svg' });
        sys.onclick = () => { window.focus(); if (url) router.push(url); sys.close(); };
      } catch { /* some browsers only allow notifications from a service worker */ }
    }
  }, !!me);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-20 sm:items-end" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} role="status" data-testid="toast"
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-surface-line bg-white p-3 shadow-lg ring-1 ring-black/5 dark:border-white/10 dark:bg-[#1b1c3a]">
          <div className="mt-0.5 text-xl" aria-hidden>{NOTIF_ICON[n.type] ?? '🔔'}</div>
          <button className="min-w-0 flex-1 text-left" onClick={() => { if (!n.url) return; api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => undefined); router.push(n.url); dismiss(n.id); }}>
            <div className="text-sm font-semibold text-ink dark:text-white">{n.title}</div>
            <div className="line-clamp-2 text-sm text-ink-soft dark:text-white/70">{n.body}</div>
            {n.url && <div className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{t('Open')} →</div>}
          </button>
          <button onClick={() => dismiss(n.id)} className="rounded-lg p-1 text-ink-muted hover:bg-surface-sunk dark:hover:bg-white/10" aria-label={t('Close')}><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

/** Asks the browser for permission to show desktop notifications while UNRET is in the background. */
export function DesktopNotificationsToggle() {
  const { t } = useT();
  const [perm, setPerm] = useState<string>('default');
  useEffect(() => { setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission); }, []);
  if (perm === 'unsupported') return null;
  if (perm === 'granted') return <p className="text-sm text-ink-soft dark:text-white/70">🖥️ {t('Desktop notifications are on for this browser.')}</p>;
  if (perm === 'denied') return <p className="text-sm text-ink-muted">🖥️ {t('Desktop notifications are blocked in your browser settings for this site.')}</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={async () => setPerm(await Notification.requestPermission())}><BellRing className="h-4 w-4" />{t('Turn on desktop notifications')}</Button>
      <span className="text-xs text-ink-muted">{t('Get a pop-up even when UNRET is in another tab.')}</span>
    </div>
  );
}

/** "Notify me when X is free" — on a professional's profile. */
export function AvailabilityAlertButton({ professionalId, name }: { professionalId: string; name: string }) {
  const { me } = useAuth();
  const router = useRouter();
  const { t, intl } = useT();
  const [st, setSt] = useState<{ active: boolean; nextFree: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) api(`/availability/${professionalId}/alert`).then(setSt).catch(() => setSt(null)); }, [me, professionalId]);
  // The alert fired while this profile is open: show the new state right away.
  useRealtime<any>('notification', (n) => { if (n.type === 'AVAILABILITY_OPENED' && n.data?.professionalId === professionalId) api<any>(`/availability/${professionalId}/alert`).then(setSt).catch(() => undefined); }, !!me);
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const toggle = async () => {
    if (!me) return router.push(`/login?next=/pros/${professionalId}`);
    setBusy(true); setErr(null);
    try { setSt(await api(`/availability/${professionalId}/alert`, { method: st?.active ? 'DELETE' : 'POST' }).then((r: any) => ({ active: r.active, nextFree: r.nextFree ?? null }))); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (me && !st) return null;
  if (st?.nextFree && !st.active) return <p className="text-sm text-emerald-700 dark:text-emerald-300" data-testid="free-from">✓ {t('{name} has free time from {date}', { name, date: day(st.nextFree) })}</p>;
  return (
    <div className="space-y-1">
      <Button variant={st?.active ? 'secondary' : 'outline'} loading={busy} onClick={toggle} data-testid="availability-alert"
        className={cx(st?.active && '!bg-accent-100 !text-accent-ink')}>
        {st?.active ? `🔔 ${t('We’ll tell you when {name} is free', { name })}` : `🔔 ${t('Notify me when free')}`}
      </Button>
      {st?.active && <p className="text-xs text-ink-muted">{t('You’ll get a notification as soon as they have free days. Tap again to cancel.')}</p>}
      {err && <Alert>{err}</Alert>}
    </div>
  );
}
