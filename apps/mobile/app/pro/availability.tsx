import { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { DateTimeField } from '@/components/domain';
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
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  useEffect(() => { if (data) setRules(data.rules.filter((r: any) => !r.isEmergency).map(({ weekday, startTime, endTime }: Rule) => ({ weekday, startTime, endTime }))); }, [data]);
  if (loading || !data) return <Loader />;
  const run = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ tone: 'green', text: ok }); reload(); appts.reload(); }).catch((e) => setMsg({ tone: 'red', text: e.message }));
  const valid = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const setting = (k: string, v: unknown) => run(() => api('/availability/me/settings', { method: 'PUT', body: { [k]: v } }), t('Settings saved.'));

  return (
    <Screen>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text style={{ flex: 1 }} variant="label">{t('Accepting new requests')}</Text><Switch value={data.settings.acceptingRequests} onValueChange={(v) => setting('acceptingRequests', v)} trackColor={{ true: th.brand }} /></Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text style={{ flex: 1 }} variant="label">{t('Emergency availability')}</Text><Switch value={data.settings.emergencyAvailable} onValueChange={(v) => setting('emergencyAvailable', v)} trackColor={{ true: th.brand }} /></Row>
        <Text variant="small">{t('Times are in {tz}.', { tz: data.settings.timezone })}</Text>
      </Card>
      <Section title={t('Weekly working hours')}>
        <Card>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const idx = rules.findIndex((r) => r.weekday === d);
            const r = rules[idx];
            return (
              <Row key={d} style={{ flexWrap: 'nowrap', minHeight: 44 }}>
                <Text style={{ width: 90 }}>{t(DAYS[d])}</Text>
                {r ? (<>
                  <Input value={r.startTime} onChangeText={(v) => setRules(rules.map((x, i) => (i === idx ? { ...x, startTime: v } : x)))} style={{ flex: 1, minHeight: 40, paddingVertical: 6 }} accessibilityLabel={`${t(DAYS[d])} ${t('From')}`} />
                  <Text>–</Text>
                  <Input value={r.endTime} onChangeText={(v) => setRules(rules.map((x, i) => (i === idx ? { ...x, endTime: v } : x)))} style={{ flex: 1, minHeight: 40, paddingVertical: 6 }} accessibilityLabel={`${t(DAYS[d])} ${t('To')}`} />
                  <Button small variant="ghost" title="✕" onPress={() => setRules(rules.filter((_, i) => i !== idx))} />
                </>) : <><Text variant="small" style={{ flex: 1 }}>{t('Closed')}</Text><Button small variant="soft" title={t('Add hours')} onPress={() => setRules([...rules, { weekday: d, startTime: '09:00', endTime: '17:00' }])} /></>}
              </Row>
            );
          })}
          <Button title={t('Save working hours')} disabled={!rules.every((r) => valid(r.startTime) && valid(r.endTime))} onPress={() => run(() => api('/availability/me/rules', { method: 'PUT', body: { rules } }), t('Working hours saved.'))} />
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
