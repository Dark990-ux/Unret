'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { WEEKDAYS } from '@/components/domain';
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, PageLoader, StatusBadge } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date, dateTime, fromLocalInput } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Availability /></ProShell>;
}

type Rule = { weekday: number; startTime: string; endTime: string; isEmergency?: boolean };

function Availability() {
  const { t, intl } = useT();
  const { data, loading, reload } = useApi<{ rules: Rule[]; blocks: any[]; periods: any[]; settings: any }>('/availability/me');
  const appts = useApi<any[]>('/availability/me/appointments');
  const [rules, setRules] = useState<Rule[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [block, setBlock] = useState({ start: '', end: '', reason: '' });
  const [period, setPeriod] = useState({ start: '', end: '', note: '' });
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  useEffect(() => { if (data) { setRules(data.rules.map(({ weekday, startTime, endTime, isEmergency }) => ({ weekday, startTime, endTime, isEmergency }))); setSettings(data.settings); } }, [data]);
  if (loading || !data || !settings) return <PageLoader />;

  const order = [1, 2, 3, 4, 5, 6, 0];
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ tone: 'green', text: ok }); reload(); }).catch((e) => setMsg({ tone: 'red', text: e.message }));
  const upcoming = (appts.data ?? []).filter((a) => new Date(a.endsAt) > new Date());

  return (
    <>
      <PageHeader title={t('Calendar & availability')} subtitle={t('Times are in {tz}.', { tz: settings.timezone })} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold text-ink dark:text-white">✦ {t('Open for bookings')}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t('Add the periods when customers can book you, for example 15 Dec → 15 Jan. If you add none, all your working days are bookable.')}</p>
            </div>
            {(data.periods ?? []).length > 0 && (
              <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">
                {data.periods.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>{date(p.startDate.slice(0, 10) + 'T12:00:00Z', intl)} → {date(p.endDate.slice(0, 10) + 'T12:00:00Z', intl)}{p.note && <span className="text-ink-muted"> · {p.note}</span>}</span>
                    <button onClick={() => run(() => api(`/availability/me/periods/${p.id}`, { method: 'DELETE' }), t('Removed.'))} className="p-1 text-ink-muted hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end">
              <Field label={t('From')}><Input id="period-from" type="date" min={new Date().toISOString().slice(0, 10)} value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /></Field>
              <Field label={t('To')}><Input id="period-to" type="date" min={period.start || new Date().toISOString().slice(0, 10)} value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></Field>
              <Field label={t('Note (optional)')}><Input id="period-note" value={period.note} maxLength={120} placeholder={t('e.g. Winter availability')} onChange={(e) => setPeriod({ ...period, note: e.target.value })} /></Field>
              <Button variant="secondary" disabled={!period.start || !period.end} onClick={() => run(async () => { await api('/availability/me/periods', { body: { startDate: period.start, endDate: period.end, note: period.note || undefined } }); setPeriod({ start: '', end: '', note: '' }); }, t('Period added.'))}>{t('Add period')}</Button>
            </div>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold text-ink dark:text-white">{t('Weekly working hours')}</h2>
            {order.map((d) => {
              const dayRules = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d && !r.isEmergency);
              return (
                <div key={d} className="flex flex-col gap-2 border-b border-surface-line pb-3 last:border-0 sm:flex-row sm:items-start dark:border-white/10">
                  <div className="w-28 pt-2 text-sm font-medium text-ink dark:text-white">{t(WEEKDAYS[d])}</div>
                  <div className="flex-1 space-y-2">
                    {!dayRules.length && <div className="pt-2 text-sm text-ink-muted">{t('Closed')}</div>}
                    {dayRules.map(({ r, i }) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={r.startTime} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} className="w-32" aria-label={t('From')} />
                        <span className="text-ink-muted">–</span>
                        <Input type="time" value={r.endTime} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, endTime: e.target.value } : x)))} className="w-32" aria-label={t('To')} />
                        <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-muted hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setRules([...rules, { weekday: d, startTime: '09:00', endTime: '17:00' }])}><Plus className="h-4 w-4" />{t('Add hours')}</Button>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => run(() => api('/availability/me/rules', { method: 'PUT', body: { rules } }), t('Working hours saved.'))}>{t('Save working hours')}</Button>
              <Button variant="outline" onClick={() => setRules([1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '08:00', endTime: '17:00' })))}>{t('Use Mon–Fri 08–17')}</Button>
            </div>
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-semibold text-ink dark:text-white">{t('Time off and blocked periods')}</h2>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <Field label={t('From')}><Input type="datetime-local" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} /></Field>
              <Field label={t('To')}><Input type="datetime-local" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} /></Field>
              <Field label={t('Reason (private)')}><Input value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} /></Field>
              <Button disabled={!block.start || !block.end} onClick={() => run(async () => { await api('/availability/me/blocks', { body: { startsAt: fromLocalInput(block.start), endsAt: fromLocalInput(block.end), reason: block.reason || undefined } }); setBlock({ start: '', end: '', reason: '' }); }, t('Period blocked.'))}>{t('Block')}</Button>
            </div>
            {data.blocks.length > 0 && (
              <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">
                {data.blocks.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2">
                    <span>{dateTime(b.startsAt, intl)} → {dateTime(b.endsAt, intl)}{b.reason && <span className="text-ink-muted"> · {b.reason}</span>}</span>
                    <button onClick={() => run(() => api(`/availability/me/blocks/${b.id}`, { method: 'DELETE' }), t('Removed.'))} className="p-1 text-ink-muted hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold text-ink dark:text-white">{t('Request settings')}</h2>
            <Checkbox label={<><b>{t('Accepting new requests')}</b><br /><span className="text-ink-muted">{t('Turn off to temporarily pause new requests (holidays, fully booked).')}</span></>} checked={settings.acceptingRequests} onChange={(e) => setSettings({ ...settings, acceptingRequests: e.target.checked })} />
            <Checkbox label={<><b>{t('Emergency availability')}</b><br /><span className="text-ink-muted">{t('Receive urgent requests outside normal hours.')}</span></>} checked={settings.emergencyAvailable} onChange={(e) => setSettings({ ...settings, emergencyAvailable: e.target.checked })} />
            <Field label={t('Travel radius: {n} km', { n: settings.serviceRadiusKm })}><input type="range" min={0} max={150} step={5} value={settings.serviceRadiusKm} onChange={(e) => setSettings({ ...settings, serviceRadiusKm: Number(e.target.value) })} className="w-full accent-brand-700" /></Field>
            <Button onClick={() => run(() => api('/availability/me/settings', { method: 'PUT', body: settings }), t('Settings saved.'))}>{t('Save settings')}</Button>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Upcoming appointments')}</h2>
            {!upcoming.length ? <p className="text-sm text-ink-muted">{t('No upcoming appointments.')}</p> : (
              <ul className="space-y-3">
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <Link href={`/jobs/${a.job?.id}`} className="block rounded-xl border border-surface-line p-3 hover:border-brand-600 dark:border-white/10">
                      <div className="text-sm font-medium text-ink dark:text-white">{dateTime(a.startsAt, intl)} – {new Date(a.endsAt).toLocaleTimeString(intl, { timeStyle: 'short' })}</div>
                      <div className="text-sm text-ink-muted">{a.job?.request.title} · {a.job?.customer.name}</div>
                      {a.job && <div className="mt-1"><StatusBadge status={a.job.status} /></div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
