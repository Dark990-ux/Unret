'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { CITIES } from '@unret/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { CitySelect } from './domain';
import { Alert, Button, Field, Input, Modal, Select, Textarea, cx } from './ui';

type DayStatus = 'free' | 'partial' | 'booked' | 'closed' | 'past';
interface Day { date: string; weekday: number; status: DayStatus; freeMinutes: number; freeSlots: string[] }

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS_AHEAD = 5;

/** Month calendar of a professional's availability; customers pick a period and send a request for it. */
export function AvailabilityCalendar({ professionalId, professionalName, services, acceptingRequests }: {
  professionalId: string; professionalName: string; services: { categoryId: string; categoryName: string }[]; acceptingRequests: boolean;
}) {
  const { t, intl } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [days, setDays] = useState<Record<string, Day>>({});
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = ymd(cursor.y, cursor.m, 1);
    if (days[key]) return;
    setLoading(true);
    api<{ days: Day[] }>(`/availability/${professionalId}/calendar`, { query: { from: key, days: daysIn(cursor.y, cursor.m) } })
      .then((r) => setDays((d) => ({ ...d, ...Object.fromEntries(r.days.map((x) => [x.date, x])) })))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, professionalId]);

  const monthIndex = (cursor.y - today.getFullYear()) * 12 + cursor.m - (today.getMonth() + 1);
  const monthName = new Date(Date.UTC(cursor.y, cursor.m - 1, 15)).toLocaleDateString(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = useMemo(() => [1, 2, 3, 4, 5, 6, 0].map((d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(intl, { weekday: 'short', timeZone: 'UTC' })), [intl]);
  const firstWeekday = (new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysIn(cursor.y, cursor.m) }, (_, i) => ymd(cursor.y, cursor.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const selectable = (d?: Day) => !!d && (d.status === 'free' || d.status === 'partial');
  const tap = (date: string) => {
    if (!selectable(days[date])) return setHint(t('Pick a day marked as available.'));
    setHint(null);
    if (!start || end) { setStart(date); setEnd(null); return; }
    if (date < start) return setStart(date);
    setEnd(date);
  };
  const last = end ?? start;
  const workDays = start && last ? Object.values(days).filter((d) => d.date >= start && d.date <= last && selectable(d)).length : 0;
  const fmt = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const label = start ? (end && end !== start ? `${fmt(start)} → ${fmt(end)}` : fmt(start)) : '';
  const statusLabel: Record<DayStatus, string> = { free: t('Available'), partial: t('Partly booked'), booked: t('Fully booked'), closed: t('Not working'), past: t('Past') };

  const request = () => {
    if (!me) return router.push(`/login?next=${encodeURIComponent(`/pros/${professionalId}`)}`);
    setOpen(true);
  };

  return (
    <div className="max-w-xl space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }))} disabled={monthIndex <= 0} aria-label={t('Previous month')} className="rounded-lg p-1.5 hover:bg-surface-sunk disabled:opacity-30 dark:hover:bg-white/5"><ChevronLeft className="h-5 w-5" /></button>
        <div className="font-semibold capitalize text-ink dark:text-white" aria-live="polite">{monthName}{loading ? ' …' : ''}</div>
        <button onClick={() => setCursor(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }))} disabled={monthIndex >= MONTHS_AHEAD} aria-label={t('Next month')} className="rounded-lg p-1.5 hover:bg-surface-sunk disabled:opacity-30 dark:hover:bg-white/5"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-muted">{weekdays.map((w) => <div key={w} className="capitalize">{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthName}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const d = days[date];
          const status: DayStatus = d?.status ?? 'closed';
          const inRange = !!start && date >= start && date <= (end ?? start);
          const edge = date === start || date === end;
          return (
            <button key={date} onClick={() => tap(date)} aria-pressed={inRange} aria-label={`${fmt(date)}: ${statusLabel[status]}${d?.freeSlots.length ? ` (${d.freeSlots.join(', ')})` : ''}`}
              title={d?.freeSlots.length ? d.freeSlots.join(', ') : statusLabel[status]}
              className={cx('relative h-10 rounded-lg text-sm tabular-nums transition-colors sm:h-11',
                edge ? 'bg-brand-700 font-semibold text-white dark:bg-brand-400 dark:text-brand-950'
                  : inRange ? 'bg-brand-200 font-semibold text-brand-900 dark:bg-brand-800 dark:text-white'
                  : status === 'free' ? 'bg-brand-50 font-semibold text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-100'
                  : status === 'partial' ? 'bg-accent-100 font-semibold text-ink hover:bg-accent-300/60 dark:bg-accent-500/20 dark:text-white'
                  : status === 'booked' ? 'cursor-not-allowed text-ink-muted line-through'
                  : status === 'past' ? 'cursor-default text-ink-muted/40' : 'cursor-not-allowed text-ink-muted')}>
              {Number(date.slice(8))}
              {status === 'partial' && !edge && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent-600" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-brand-600 bg-brand-50" />{t('Available')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-accent-600 bg-accent-100" />{t('Partly booked')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-surface-line" />{t('Unavailable')}</span>
      </div>
      {hint && <p className="text-xs text-red-600">{hint}</p>}
      {!acceptingRequests ? <Alert tone="amber">{t('Not taking new requests at the moment')}</Alert> : start ? (
        <div className="space-y-2 rounded-xl bg-surface-sunk p-3 dark:bg-white/5">
          <div className="text-sm font-medium text-ink dark:text-white">{label} · {t('{n} working days available', { n: workDays })}</div>
          {!end && <p className="text-xs text-ink-muted">{t('Tap another day to choose an end date, or continue with one day.')}</p>}
          {days[start]?.freeSlots.length ? <p className="text-xs text-ink-muted">{t('Free on {date}: {slots}', { date: fmt(start), slots: days[start].freeSlots.join(', ') })}</p> : null}
          <div className="flex gap-2">
            <Button className="flex-1 !bg-accent-500 !text-accent-ink hover:!bg-accent-400" onClick={request}><Sparkles className="h-4 w-4" />{t('Request these dates')}</Button>
            <Button variant="ghost" onClick={() => { setStart(null); setEnd(null); }}>{t('Clear')}</Button>
          </div>
        </div>
      ) : <p className="text-xs text-ink-muted">{t('Tap a start day and an end day to request work in that period.')}</p>}
      {start && <RequestPeriodModal open={open} onClose={() => setOpen(false)} professionalId={professionalId} professionalName={professionalName} services={services} start={start} end={end ?? start} periodLabel={label} />}
    </div>
  );
}

/** Pop-up shown right after choosing a period: describe the job and send it to this professional only. */
function RequestPeriodModal({ open, onClose, professionalId, professionalName, services, start, end, periodLabel }: {
  open: boolean; onClose: () => void; professionalId: string; professionalName: string; services: { categoryId: string; categoryName: string }[]; start: string; end: string; periodLabel: string;
}) {
  const { t } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ categoryId: services[0]?.categoryId ?? '', title: '', description: '', city: me?.city ?? 'București', addressText: me?.addressText ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const c = CITIES.find((x) => x.name === f.city);
      const r = await api('/requests', { body: {
        categoryId: f.categoryId, title: f.title.trim(), description: f.description.trim(), serviceMode: 'ON_SITE',
        city: f.city, lat: c?.lat, lng: c?.lng, addressText: f.addressText || undefined,
        preferredDate: `${start}T12:00:00.000Z`, preferredDateTo: `${end}T12:00:00.000Z`, professionalId, publish: true,
      } });
      router.push(`/requests/${r.id}`);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('Request {name}', { name: professionalName })}>
      <form onSubmit={send} className="space-y-4">
        <Alert tone="blue">{t('Period')}: <b>{periodLabel}</b>. {t('Only {name} receives this request. They reply with a quote you can accept.', { name: professionalName })}</Alert>
        {services.length > 1 && (
          <Field label={t('Service')} required>
            <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{services.map((s) => <option key={s.categoryId} value={s.categoryId}>{s.categoryName}</option>)}</Select>
          </Field>
        )}
        <Field label={t('Title')} required><Input id="period-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} minLength={5} maxLength={140} required placeholder={t('e.g. “Install 5 new sockets in the living room”')} /></Field>
        <Field label={t('What do you need?')} hint={t('Describe the job: what, how much, any details that help professionals quote accurately.')} required>
          <Textarea id="period-description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} minLength={20} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('City')} required><CitySelect id="period-city" value={f.city} onChange={(city) => setF({ ...f, city })} /></Field>
          <Field label={t('Address')} hint={t('Only shared with the professional you hire.')}><Input id="period-address" value={f.addressText} onChange={(e) => setF({ ...f, addressText: e.target.value })} /></Field>
        </div>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" loading={busy} className="!bg-accent-500 !text-accent-ink hover:!bg-accent-400">{t('Send request')}</Button>
        </div>
      </form>
    </Modal>
  );
}
