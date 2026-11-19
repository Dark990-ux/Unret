import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useTheme } from '@/components/theme';
import { Alert, Button, Field, Input, Row, Screen, Segmented, Text } from '@/components/ui';
import { API_ORIGIN } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Register() {
  const { t, locale } = useT();
  const th = useTheme();
  const { register } = useAuth();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await register({ name: f.name.trim(), password: f.password, countryCode: 'RO', acceptTerms: terms, preferredLanguage: locale, ...(method === 'email' ? { email: f.email.trim() } : { phone: f.phone.replace(/\s/g, '') }) });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ marginTop: 24, gap: 6 }}>
        <Text variant="big">{t('Create your account')}</Text>
        <Text color={th.soft}>{t('One account to request services — and to offer them, if you want.')}</Text>
      </View>
      <Field label={t('Full name')} required><Input value={f.name} onChangeText={(name) => setF({ ...f, name })} autoComplete="name" accessibilityLabel={t('Full name')} /></Field>
      <Segmented value={method} onChange={setMethod} items={[{ value: 'email', label: t('Email') }, { value: 'phone', label: t('Phone') }]} />
      {method === 'email'
        ? <Field label={t('Email')} required><Input value={f.email} onChangeText={(email) => setF({ ...f, email })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel={t('Email')} /></Field>
        : <Field label={t('Phone')} hint={t('International format, e.g. +40712345678')} required><Input value={f.phone} onChangeText={(phone) => setF({ ...f, phone })} keyboardType="phone-pad" placeholder="+40" /></Field>}
      <Field label={t('Password')} hint={t('At least 10 characters.')} required><Input value={f.password} onChangeText={(password) => setF({ ...f, password })} secureTextEntry autoComplete="new-password" accessibilityLabel={t('Password')} /></Field>
      <Pressable onPress={() => setTerms(!terms)} accessibilityRole="checkbox" accessibilityState={{ checked: terms }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: terms ? th.brand : th.line, backgroundColor: terms ? th.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{terms && <Text style={{ color: th.onBrand, fontSize: 13 }}>✓</Text>}</View>
        <Text style={{ flex: 1 }}>{t('I accept the')} <Text style={{ color: th.brand }} onPress={() => Linking.openURL(`${API_ORIGIN.replace(':4000', ':3000')}/terms`)}>{t('Terms of service')}</Text> {t('and the')} <Text style={{ color: th.brand }} onPress={() => Linking.openURL(`${API_ORIGIN.replace(':4000', ':3000')}/privacy`)}>{t('Privacy policy')}</Text>.</Text>
      </Pressable>
      {err && <Alert>{err}</Alert>}
      <Button title={t('Create account')} onPress={submit} loading={busy} disabled={!terms || !f.name || f.password.length < 10} />
      <Row style={{ justifyContent: 'center' }}>
        <Text variant="small">{t('Already have an account?')}</Text>
        <Link href="/login"><Text style={{ color: th.brand, fontWeight: '600' }}>{t('Sign in')}</Text></Link>
      </Row>
    </Screen>
  );
}
