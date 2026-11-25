import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { DateTimeField } from '@/components/domain';
import { TimeSelect } from '@/components/date-picker';
import { useTheme } from '@/components/theme';
import { Alert, Button, Card, Field, Input, Loader, Row, Screen, Section, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Rule = { weekday: number; startTime: string; endTime: string };

export default function Availability() {
  const { t, intl } = useT();
  const th = useTheme();
  const { data, loading, reload } = useApi<any>('/availability/me');
  const appts = useApi<any[]>('/availability/me/appointments');
  const [rules, setRules] = useState<Rule[]>([]);
  const [block, setBlock] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  const [period, setPeriod] = useState<{ start: Date | null; end: Date | null; note: string }>({ start: null, end: null, note: '' });
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  useEffect(() => { if (data) setRules(data.rules.filter((r: any) => !r.isEmergency).map(({ weekday, startTime, endTime }: Rule) => ({ weekday, startTime, endTime }))); }, [data]);
  if (loading || !data) return <Loader />;
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ tone: 'green', text: ok }); reload(); appts.reload(); }).catch((e) => setMsg({ tone: 'red', text: e.message }));
  const valid = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const validEnd = (s: string) => valid(s) || s === '24:00';
  const hours = (r: Rule) => { const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)); const h = (m(r.endTime) - m(r.startTime)) / 60; return h > 0 ? t('{n} h', { n: Number.isInteger(h) ? h : h.toFixed(1) }) : ''; };
  const setting = (k: string, v: unknown) => run(() => api('/availability/me/settings', { method: 'PUT', body: { [k]: v } }), t('Settings saved.'));

  return (
    <Screen>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text style={{ flex: 1 }} variant="label">{t('Accepting new requests')}</Text><Switch value={data.settings.acceptingRequests} onValueChange={(v) => setting('acceptingRequests', v)} trackColor={{ true: th.brand }} /></Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text style={{ flex: 1 }} variant="label">{t('Emergency availability')}</Text><Switch value={data.settings.emergencyAvailable} onValueChange={(v) => setting('emergencyAvailable', v)} trackColor={{ true: th.brand }} /></Row>
        <Text variant="small">{t('Times are in {tz}.', { tz: data.settings.timezone })}</Text>
      </Card>
      <Section title={t('Open for bookings')}>
        <Card>
          <Text variant="small">{t('Add the periods when customers can book you, for example 15 Dec → 15 Jan. If you add none, all your working days are bookable.')}</Text>
          {(data.periods ?? []).map((p: any) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1 }}>✦ {p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)}{p.note ? ` · ${p.note}` : ''}</Text>
              <Button small variant="ghost" title="✕" onPress={() => run(() => api(`/availability/me/periods/${p.id}`, { method: 'DELETE' }), t('Removed.'))} />
            </Row>
          ))}
          <Field label={t('From')}><DateTimeField mode="date" value={period.start} onChange={(start) => setPeriod({ ...period, start })} /></Field>
          <Field label={t('To')}><DateTimeField mode="date" value={period.end} onChange={(end) => setPeriod({ ...period, end })} /></Field>
          <Field label={t('Note (optional)')}><Input value={period.note} onChangeText={(note) => setPeriod({ ...period, note })} placeholder={t('e.g. Winter availability')} maxLength={120} /></Field>
          <Button title={t('Add period')} variant="soft" disabled={!period.start || !period.end} onPress={() => run(async () => {
            const d = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
            await api('/availability/me/periods', { body: { startDate: d(period.start!), endDate: d(period.end!), note: period.note || undefined } });
            setPeriod({ start: null, end: null, note: '' });
          }, t('Period added.'))} />
        </Card>
      </Section>
      <Section title={t('Weekly working hours')}>
        <Card style={{ gap: 4 }}>
          <Text variant="small">{t('Turn on the days you work and pick your hours. Customers see this in your calendar.')}</Text>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const idx = rules.findIndex((r) => r.weekday === d);
            const r = rules[idx];
            const set = (patch: Partial<Rule>) => setRules(rules.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
            return (
              <View key={d} testID={`day-${d}`} style={{ paddingVertical: 8, borderTopWidth: d === 1 ? 0 : 1, borderColor: th.line, gap: 8 }}>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <Text variant="label" style={{ flex: 1 }}>{t(DAYS[d])}</Text>
                  {!r && <Text variant="small" style={{ marginRight: 8 }}>{t('Closed')}</Text>}
                  <Switch value={!!r} onValueChange={(on) => setRules(on ? [...rules, (() => { const tpl = rules.find((x) => x.weekday === 1) ?? { startTime: '09:00', endTime: '17:00' }; return { weekday: d, startTime: tpl.startTime, endTime: tpl.endTime }; })()] : rules.filter((x) => x.weekday !== d))}
                    trackColor={{ true: th.brand }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} accessibilityLabel={t(DAYS[d])} />
                </Row>
                {r && (
                  <Row gap={8}>
                    <TimeSelect value={r.startTime} label={`${t(DAYS[d])} · ${t('Start')}`} max={r.endTime} onChange={(startTime) => set({ startTime })} testID={`start-${d}`} />
                    <Text>–</Text>
                    <TimeSelect value={r.endTime} label={`${t(DAYS[d])} · ${t('End')}`} min={r.startTime} onChange={(endTime) => set({ endTime })} testID={`end-${d}`} />
                    <Text variant="small">{hours(r)}</Text>
                  </Row>
                )}
              </View>
            );
          })}
          {rules.some((r) => r.weekday === 1) && (
            <Button small variant="ghost" title={t('Copy Monday to all weekdays')} onPress={() => {
              const mon = rules.find((r) => r.weekday === 1)!;
              setRules([...rules.filter((r) => ![1, 2, 3, 4, 5].includes(r.weekday)), ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: mon.startTime, endTime: mon.endTime }))]);
            }} />
          )}
          <Button title={t('Save working hours')} onPress={() => {
            const bad = rules.find((r) => !valid(r.startTime) || !validEnd(r.endTime) || r.endTime <= r.startTime);
            if (bad) return setMsg({ tone: 'red', text: t('{day}: the finishing time must be after the starting time.', { day: t(DAYS[bad.weekday]) }) });
            if (!rules.length) return setMsg({ tone: 'red', text: t('Turn on at least one working day.') });
            run(() => api('/availability/me/rules', { method: 'PUT', body: { rules } }), t('Working hours saved.'));
          }} />
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </Card>
      </Section>
      <Section title={t('Time off and blocked periods')}>
        <Card>
          <Field label={t('From')}><DateTimeField value={block.start} onChange={(start) => setBlock({ ...block, start })} /></Field>
          <Field label={t('To')}><DateTimeField value={block.end} onChange={(end) => setBlock({ ...block, end })} /></Field>
          <Button title={t('Block')} disabled={!block.start || !block.end} onPress={() => run(async () => { await api('/availability/me/blocks', { body: { startsAt: block.start!.toISOString(), endsAt: block.end!.toISOString() } }); setBlock({ start: null, end: null }); }, t('Period blocked.'))} />
          {data.blocks.map((b: any) => (
            <Row key={b.id} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text variant="small" style={{ flex: 1 }}>{dateTime(b.startsAt, intl)} → {dateTime(b.endsAt, intl)}</Text>
              <Button small variant="ghost" title="✕" onPress={() => run(() => api(`/availability/me/blocks/${b.id}`, { method: 'DELETE' }), t('Removed.'))} />
            </Row>
          ))}
        </Card>
      </Section>
      <Section title={t('Upcoming appointments')}>
        {!appts.data?.filter((a) => new Date(a.endsAt) > new Date()).length ? <Text variant="small">{t('No upcoming appointments.')}</Text> :
          appts.data.filter((a) => new Date(a.endsAt) > new Date()).map((a) => (
            <Card key={a.id}><Text variant="label">{dateTime(a.startsAt, intl)}</Text><Text variant="small">{a.job?.request.title} · {a.job?.customer.name}</Text></Card>
          ))}
      </Section>
    </Screen>
  );
}
