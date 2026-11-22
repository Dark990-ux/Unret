import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
  JOB_STATUS_CHANGED: 'Job updates', REVIEW_RECEIVED: 'Review received', PAYMENT_TO_CONFIRM: 'Payment to confirm', OFFER_REVISED: 'Offer revised', OFFER_REJECTED: 'Offer declined', AVAILABILITY_OPENED: 'A professional you follow is free', PLAN_LIMIT_REACHED: 'Daily request limit reached', SUBSCRIPTION_UPDATED: 'Plan and billing updates',
};

export default function Settings() {
  const { t } = useT();
  const th = useTheme();
  const { me, reload, logout } = useAuth();
  const prefs = useApi<any[]>('/notifications/preferences');
  const alerts = useApi<{ professionalId: string; name: string }[]>('/availability/alerts/mine');
  const emailQ = useApi<{ enabled: boolean; email: string | null; serviceConnected: boolean }>('/notifications/email');
  const setEmail = async (enabled: boolean) => { emailQ.setData({ ...emailQ.data!, enabled }); try { emailQ.setData(await api('/notifications/email', { method: 'PUT', body: { enabled } })); } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); emailQ.reload(); } };
  const testEmail = () => wrap(async () => { const r = await api<any>('/notifications/email/test', { method: 'POST' }); if (!r.sent) throw new Error(t('Add an email address to your account first')); }, t('Test email sent to {email}. Check your inbox (and spam folder).', { email: emailQ.data?.email ?? '' }));
  const [p, setP] = useState({ name: me?.name ?? '', city: me?.city ?? '', addressText: me?.addressText ?? '' });
  // Fill the form once the account has loaded (opening Settings directly).
  useEffect(() => { if (me) setP((x) => (x.name ? x : { name: me.name ?? '', city: me.city ?? '', addressText: me.addressText ?? '' })); }, [me?.id]);
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
      <Section title={`✉️ ${t('Email notifications')}`}>
        <Card>
          {!emailQ.data ? <Loader /> : (
            <>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Text style={{ flex: 1 }}>{t('Email notifications')}</Text>
                <Switch value={emailQ.data.enabled} onValueChange={setEmail} trackColor={{ true: th.brand }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} accessibilityLabel={t('Email notifications')} testID="email-switch" />
              </Row>
              <Text variant="small">{emailQ.data.enabled ? t('We email you about new requests, offers, messages and other updates at {email}.', { email: emailQ.data.email ?? '—' }) : t('Emails are off. You still get notifications in the app and on your phone.')}</Text>
              {emailQ.data.enabled && <Button small variant="outline" title={t('Send me a test email')} onPress={testEmail} />}
            </>
          )}
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
      <Section title={`🔔 ${t('Notify me when free')}`}>
        <Card>
          <Text variant="small">{t('Busy professionals you follow. We notify you once as soon as they have free days, then the alert switches off.')}</Text>
          {!alerts.data?.length ? <Text variant="small">{t('No alerts yet. Open a professional’s profile and tap “Notify me when free”.')}</Text> : alerts.data.map((a) => (
            <Row key={a.professionalId} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1, color: th.brand, fontWeight: '600' }} onPress={() => router.push(`/pros/${a.professionalId}`)}>{a.name}</Text>
              <Button small variant="ghost" title={t('Cancel alert')} onPress={async () => { await api(`/availability/${a.professionalId}/alert`, { method: 'DELETE' }); alerts.reload(); }} />
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
