import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CitySelect } from './domain';
import { useTheme } from './theme';
import { Alert, Button, Field, Input, Row, Select, Sheet, Text } from './ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { CITIES } from '@unret/shared';

export type DayStatus = 'free' | 'partial' | 'booked' | 'closed' | 'past';
interface Day { date: string; weekday: number; status: DayStatus; outsidePeriods?: boolean; freeMinutes: number; freeSlots: string[] }
interface Period { start: string; end: string; note: string | null }

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS_AHEAD = 5;

/** Month calendar of a professional's availability; customers pick a period and send a request for it. */
export function AvailabilityCalendar({ professionalId, professionalName, services, acceptingRequests }: {
  professionalId: string; professionalName: string; services: { categoryId: string; categoryName: string }[]; acceptingRequests: boolean;
}) {
  const th = useTheme();
  const { t, intl } = useT();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [days, setDays] = useState<Record<string, Day>>({});
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);

  useEffect(() => {
    const key = ymd(cursor.y, cursor.m, 1);
    if (days[key]) return;
    setLoading(true);
    api<{ days: Day[]; periods?: Period[] }>(`/availability/${professionalId}/calendar`, { query: { from: key, days: daysIn(cursor.y, cursor.m) } })
      .then((r) => { setDays((d) => ({ ...d, ...Object.fromEntries(r.days.map((x) => [x.date, x])) })); if (r.periods) setPeriods(r.periods); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [cursor, professionalId]);

  const monthIndex = (cursor.y - today.getFullYear()) * 12 + cursor.m - (today.getMonth() + 1);
  const monthName = new Date(Date.UTC(cursor.y, cursor.m - 1, 15)).toLocaleDateString(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekdays = useMemo(() => [1, 2, 3, 4, 5, 6, 0].map((d) => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(intl, { weekday: 'narrow', timeZone: 'UTC' })), [intl]);
  const firstWeekday = (new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysIn(cursor.y, cursor.m) }, (_, i) => ymd(cursor.y, cursor.m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const selectable = (d?: Day) => !!d && (d.status === 'free' || d.status === 'partial');
  const tap = (date: string) => {
    const d = days[date];
    if (!selectable(d)) { setHint(t('Pick a day marked as available.')); return; }
    setHint(null);
    if (!start || (start && end)) { setStart(date); setEnd(null); return; }
    if (date < start) { setStart(date); return; }
    setEnd(date);
  };
  const last = end ?? start;
  const inRangeDays = start && last ? Object.values(days).filter((d) => d.date >= start && d.date <= last) : [];
  const workDays = inRangeDays.filter((d) => selectable(d)).length;
  const workingInRange = inRangeDays.filter((d) => d.status !== 'closed' && d.status !== 'past').length;
  const mostlyBooked = workDays * 2 < workingInRange;
  const fmt = (s: string) => new Date(s + 'T12:00:00Z').toLocaleDateString(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const colors: Record<DayStatus, { bg: string; fg: string }> = {
    free: { bg: th.brandSoft, fg: th.brandDark },
    partial: { bg: th.sunSoft, fg: th.text },
    booked: { bg: 'transparent', fg: th.muted },
    closed: { bg: 'transparent', fg: th.muted },
    past: { bg: 'transparent', fg: th.line },
  };

  return (
    <View style={{ gap: 10 }}>
      {periods.length > 0 && (
        <View style={{ backgroundColor: th.sunSoft, borderRadius: 10, padding: 10, gap: 2 }}>
          <Text variant="label">✦ {t('Open for bookings')}</Text>
          {periods.map((p) => <Text key={p.start} variant="small">{fmt(p.start)} → {fmt(p.end)}{p.note ? ` · ${p.note}` : ''}</Text>)}
        </View>
      )}
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Pressable onPress={() => monthIndex > 0 && setCursor(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }))} disabled={monthIndex <= 0} accessibilityRole="button" accessibilityLabel={t('Previous month')} hitSlop={10} style={{ opacity: monthIndex <= 0 ? 0.3 : 1, padding: 6 }}>
          <Text variant="h2">‹</Text>
        </Pressable>
        <Text variant="h2" style={{ textTransform: 'capitalize' }}>{monthName}{loading ? ' …' : ''}</Text>
        <Pressable onPress={() => monthIndex < MONTHS_AHEAD && setCursor(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }))} disabled={monthIndex >= MONTHS_AHEAD} accessibilityRole="button" accessibilityLabel={t('Next month')} hitSlop={10} style={{ opacity: monthIndex >= MONTHS_AHEAD ? 0.3 : 1, padding: 6 }}>
          <Text variant="h2">›</Text>
        </Pressable>
      </Row>
      <View style={{ flexDirection: 'row' }}>{weekdays.map((w, i) => <Text key={i} variant="small" style={{ flex: 1, textAlign: 'center' }}>{w}</Text>)}</View>
      <View style={{ gap: 4 }}>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {cells.slice(r * 7, r * 7 + 7).map((date, i) => {
              if (!date) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
              const d = days[date];
              const status: DayStatus = d?.status ?? 'closed';
              const inRange = !!start && date >= start && date <= (end ?? start);
              const edge = date === start || date === end;
              const c = colors[status];
              const label = `${fmt(date)}: ${d?.outsidePeriods ? t('Not taking bookings') : t({ free: 'Available', partial: 'Partly booked', booked: 'Fully booked', closed: 'Not working', past: 'Past' }[status])}`;
              return (
                <Pressable key={date} onPress={() => tap(date)} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: inRange, disabled: !selectable(d) }}
                  style={{ flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: edge ? th.brand : inRange ? th.brand + '33' : c.bg }}>
                  <Text style={{ fontSize: 14, fontWeight: selectable(d) ? '600' : '400', color: edge ? th.onBrand : c.fg, textDecorationLine: status === 'booked' ? 'line-through' : 'none' }}>{Number(date.slice(8))}</Text>
                  {status === 'partial' && !edge && <View style={{ position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: th.star }} />}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Row gap={12}>
        <Legend color={th.brandSoft} border={th.brand} label={t('Available')} />
        <Legend color={th.sunSoft} border={th.star} label={t('Partly booked')} />
        <Legend color="transparent" border={th.line} label={t('Unavailable')} />
      </Row>
      {hint && <Text variant="small" color={th.danger}>{hint}</Text>}
      {!acceptingRequests ? (
        <Alert tone="amber">{t('Not taking new requests at the moment')}</Alert>
      ) : start ? (
        <View style={{ gap: 8, backgroundColor: th.sunk, borderRadius: 12, padding: 12 }}>
          <Text variant="label">{end && end !== start ? `${fmt(start)} → ${fmt(end)}` : fmt(start)} · {t('{n} working days available', { n: workDays })}</Text>
          {!end && <Text variant="small">{t('Tap another day to choose an end date, or continue with one day.')}</Text>}
          {days[start]?.freeSlots.length ? <Text variant="small">{t('Free on {date}: {slots}', { date: fmt(start), slots: days[start].freeSlots.join(', ') })}</Text> : null}
          {mostlyBooked && <Text variant="small" color={th.danger}>{t('Most of this period is already booked. Please choose other dates.')}</Text>}
          <Row style={{ flexWrap: 'nowrap' }}>
            <Button title={t('Request these dates')} variant="sun" onPress={() => setOpen(true)} disabled={mostlyBooked} style={{ flex: 1 }} />
            <Button title={t('Clear')} variant="ghost" onPress={() => { setStart(null); setEnd(null); }} />
          </Row>
        </View>
      ) : (
        <Text variant="small">{t('Tap a start day and an end day to request work in that period.')}</Text>
      )}
      <RequestPeriodSheet open={open} onClose={() => setOpen(false)} professionalId={professionalId} professionalName={professionalName} services={services} start={start} end={end ?? start} periodLabel={start ? (end && end !== start ? `${fmt(start)} → ${fmt(end)}` : fmt(start)) : ''} />
    </View>
  );
}

function Legend({ color, border, label }: { color: string; border: string; label: string }) {
  return <Row gap={6}><View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color, borderWidth: 1, borderColor: border }} /><Text variant="small">{label}</Text></Row>;
}

/** Pop-up shown right after choosing a period: describe the job and send it to this professional only. */
function RequestPeriodSheet({ open, onClose, professionalId, professionalName, services, start, end, periodLabel }: {
  open: boolean; onClose: () => void; professionalId: string; professionalName: string; services: { categoryId: string; categoryName: string }[]; start: string | null; end: string | null; periodLabel: string;
}) {
  const { t } = useT();
  const { me } = useAuth();
  const [f, setF] = useState({ categoryId: services[0]?.categoryId ?? '', title: '', description: '', city: me?.city ?? 'București', addressText: me?.addressText ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const c = CITIES.find((x) => x.name === f.city);
      const r = await api('/requests', { body: {
        categoryId: f.categoryId, title: f.title.trim(), description: f.description.trim(), serviceMode: 'ON_SITE',
        city: f.city, lat: c?.lat, lng: c?.lng, addressText: f.addressText || undefined,
        preferredDate: `${start}T12:00:00.000Z`, preferredDateTo: `${end}T12:00:00.000Z`, professionalId, publish: true,
      } });
      onClose();
      router.push(`/requests/${r.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('Request {name}', { name: professionalName })}>
      <Alert tone="blue">{t('Period')}: {periodLabel}. {t('Only {name} receives this request. They reply with a quote you can accept.', { name: professionalName })}</Alert>
      {services.length > 1 && <Field label={t('Service')} required><Select value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId })} options={services.map((s) => ({ value: s.categoryId, label: s.categoryName }))} placeholder={t('Choose a service')} /></Field>}
      <Field label={t('Title')} required><Input value={f.title} onChangeText={(title) => setF({ ...f, title })} maxLength={140} placeholder={t('e.g. “Install 5 new sockets in the living room”')} accessibilityLabel={t('Title')} /></Field>
      <Field label={t('What do you need?')} hint={t('Describe the job: what, how much, any details that help professionals quote accurately.')} required><Input multiline value={f.description} onChangeText={(description) => setF({ ...f, description })} accessibilityLabel={t('What do you need?')} /></Field>
      <Field label={t('City')} required><CitySelect value={f.city} onChange={(city) => setF({ ...f, city })} /></Field>
      <Field label={t('Address')} hint={t('Only shared with the professional you hire.')}><Input value={f.addressText} onChangeText={(addressText) => setF({ ...f, addressText })} /></Field>
      {err && <Alert>{err}</Alert>}
      <Button title={t('Send request')} variant="sun" onPress={send} loading={busy} disabled={!f.categoryId || f.title.trim().length < 5 || f.description.trim().length < 20} />
      <Button title={`‹ ${t('Back to calendar')}`} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
