import { router } from 'expo-router';
import { Switch, View } from 'react-native';
import { LOCALES } from '@unret/shared';
import { useTheme } from '@/components/theme';
import { Alert, Avatar, Badge, Button, Card, Divider, Row, Screen, Segmented, StatusBadge, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import Constants from 'expo-constants';

export default function Account() {
  const { t, locale, setLocale } = useT();
  const th = useTheme();
  const { me, mode, setMode, logout } = useAuth();
  const avail = useApi<any>(me?.professional && mode === 'professional' ? '/availability/me' : null);
  if (!me) return null;
  const toggleAccepting = async (v: boolean) => {
    const s = await api('/availability/me/settings', { method: 'PUT', body: { acceptingRequests: v } });
    avail.setData({ ...avail.data, settings: s });
  };
  return (
    <Screen>
      <Card>
        <Row style={{ flexWrap: 'nowrap' }} gap={12}>
          <Avatar name={me.name} size={56} />
          <View style={{ flex: 1 }}><Text variant="h2">{me.name}</Text><Text variant="small">{me.email ?? me.phone}</Text></View>
        </Row>
        {me.professional && <Row gap={6}><Badge tone="blue">{t('Professional')}</Badge><StatusBadge status={me.professional.visibility} /></Row>}
      </Card>

      <Card>
        <Text variant="h2">{t('Mode')}</Text>
        {me.professional ? (
          <Segmented value={mode} onChange={(m) => { setMode(m); router.replace('/(tabs)'); }} items={[{ value: 'customer', label: t('Customer mode') }, { value: 'professional', label: t('Professional mode') }]} />
        ) : (
          <>
            <Text variant="small">{t('Receive requests from customers in your area, send offers, manage your calendar and build your reputation — all in one place.')}</Text>
            <Button title={t('Offer your services')} variant="soft" onPress={() => router.push('/pro/onboard')} />
          </>
        )}
      </Card>

      {mode === 'professional' && avail.data && (
        <Card>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Text variant="label">{t('Accepting new requests')}</Text><Text variant="small">{t('Turn off to temporarily pause new requests (holidays, fully booked).')}</Text></View>
            <Switch value={avail.data.settings.acceptingRequests} onValueChange={toggleAccepting} trackColor={{ true: th.brand }} accessibilityLabel={t('Accepting new requests')} />
          </Row>
          <Divider />
          <Button title={t('Calendar & availability')} variant="outline" onPress={() => router.push('/pro/availability')} />
          <Button title={`🏦 ${t('Payout account (IBAN)')}`} variant="outline" onPress={() => router.push('/pro/payout')} />
          <Button title={t('View public profile')} variant="ghost" onPress={() => router.push(`/pros/${me.professional!.id}`)} />
        </Card>
      )}

      <Card>
        <Text variant="h2">{t('Language')}</Text>
        <Segmented value={locale} onChange={(l) => { setLocale(l); api('/users/me', { method: 'PATCH', body: { preferredLanguage: l } }).catch(() => undefined); }} items={LOCALES.map((l) => ({ value: l.code, label: l.label }))} />
      </Card>

      <Card>
        <Button title={t('Notifications')} variant="ghost" onPress={() => router.push('/notifications')} style={{ justifyContent: 'flex-start' }} />
        <Button title={t('Saved professionals')} variant="ghost" onPress={() => router.push('/search?saved=1')} style={{ justifyContent: 'flex-start' }} />
        <Button title={t('Settings')} variant="ghost" onPress={() => router.push('/settings')} style={{ justifyContent: 'flex-start' }} />
      </Card>
      {me.role === 'ADMIN' && <Alert tone="blue">{t('Administration is available on the website.')}</Alert>}
      <Button title={t('Sign out')} variant="outline" onPress={async () => { await logout(); router.replace('/login'); }} />
      <Text variant="small" style={{ textAlign: 'center' }}>UNRET · {t('Version')} {Constants.expoConfig?.version}</Text>
    </Screen>
  );
}
