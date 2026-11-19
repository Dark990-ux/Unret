import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { CitySelect } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Alert, Button, Card, Field, Input, Loader, Row, Screen, Section, Text } from '@/components/ui';
import { API_ORIGIN, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

const LABELS: Record<string, string> = {
  NEW_MATCHING_REQUEST: 'New matching request', NEW_OFFER: 'New offer', NEW_MESSAGE: 'New message', APPOINTMENT_APPROACHING: 'Appointment reminder',
  JOB_STATUS_CHANGED: 'Job updates', REVIEW_RECEIVED: 'Review received', OFFER_REVISED: 'Offer revised', OFFER_REJECTED: 'Offer declined',
};

export default function Settings() {
  const { t } = useT();
  const th = useTheme();
  const { me, reload, logout } = useAuth();
  const prefs = useApi<any[]>('/notifications/preferences');
  const [p, setP] = useState({ name: me?.name ?? '', city: me?.city ?? '', addressText: me?.addressText ?? '' });
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const wrap = (fn: () => Promise<unknown>, ok: string) => fn().then(() => setMsg({ tone: 'green', text: ok })).catch((e) => setMsg({ tone: 'red', text: e.message }));
  const togglePush = (type: string, v: boolean) => {
    const next = prefs.data!.map((x) => (x.type === type ? { ...x, push: v } : x));
    prefs.setData(next);
    api('/notifications/preferences', { method: 'PUT', body: { items: next.map(({ type, inApp, email, push, sms }) => ({ type, inApp, email, push, sms })) } }).catch(() => undefined);
  };
  return (
    <Screen>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Section title={t('Profile')}>
        <Card style={{ gap: 12 }}>
          <Field label={t('Full name')}><Input value={p.name} onChangeText={(name) => setP({ ...p, name })} /></Field>
          <Field label={t('City')}><CitySelect value={p.city} onChange={(city) => setP({ ...p, city })} allowEmpty /></Field>
          <Field label={t('Address')} hint={t('Pre-filled when you post requests. Never shown publicly.')}><Input value={p.addressText} onChangeText={(addressText) => setP({ ...p, addressText })} /></Field>
          <Button title={t('Save profile')} onPress={() => wrap(async () => { await api('/users/me', { method: 'PATCH', body: { ...p, city: p.city || undefined } }); await reload(); }, t('Profile saved.'))} />
        </Card>
      </Section>
      <Section title={`${t('Notifications')} · ${t('Push')}`}>
        <Card>
          <Text variant="small">{t('Essential notifications (e.g. accepted offers, cancellations, payments) are always sent.')}</Text>
          {!prefs.data ? <Loader /> : prefs.data.filter((x) => !x.essential && LABELS[x.type]).map((x) => (
            <Row key={x.type} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1 }}>{t(LABELS[x.type])}</Text>
              <Switch value={x.push} onValueChange={(v) => togglePush(x.type, v)} trackColor={{ true: th.brand }} accessibilityLabel={t(LABELS[x.type])} />
            </Row>
          ))}
        </Card>
      </Section>
      <Section title={t('Your data')}>
        <Card>
          <Text variant="small">{t('Download a copy of your personal data, or delete your account. Records needed by the other party or required by law (completed jobs, payments) are kept in anonymised form.')}</Text>
          <Button variant="outline" title={t('Export my data')} onPress={() => Linking.openURL(`${API_ORIGIN.replace(':4000', ':3000')}/settings`)} />
          <Button variant="danger" title={t('Delete account')} onPress={() => wrap(async () => {
            const ok = typeof window !== 'undefined' && (window as any).confirm ? (window as any).confirm(t('Delete your account permanently? This cannot be undone.')) : true;
            if (!ok) return;
            await api('/users/me', { method: 'DELETE' }); await logout(); router.replace('/login');
          }, t('Account deleted.'))} />
        </Card>
      </Section>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
