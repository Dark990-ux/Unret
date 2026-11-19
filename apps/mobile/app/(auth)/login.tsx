import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Alert, Button, Field, Input, Row, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Login() {
  const { t } = useT();
  const th = useTheme();
  const { login } = useAuth();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { const r = await login(id.trim(), pw, mfa ? code : undefined); if (r.mfaRequired) setMfa(true); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ marginTop: 40, marginBottom: 16, gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: th.brand, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>U</Text></View>
        <Text variant="big">{t('Welcome back')}</Text>
        <Text color={th.soft}>{t('The right professional for every job.')}</Text>
      </View>
      {!mfa ? (
        <>
          <Field label={t('Email or phone')}><Input value={id} onChangeText={setId} autoCapitalize="none" autoComplete="username" keyboardType="email-address" accessibilityLabel={t('Email or phone')} /></Field>
          <Field label={t('Password')}><Input value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" accessibilityLabel={t('Password')} onSubmitEditing={submit} /></Field>
        </>
      ) : (
        <Field label={t('Verification code')} hint={t('Enter the 6-digit code from your authenticator app.')}><Input value={code} onChangeText={(s) => setCode(s.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoFocus /></Field>
      )}
      {err && <Alert>{err}</Alert>}
      <Button title={mfa ? t('Verify') : t('Sign in')} onPress={submit} loading={busy} disabled={!id || !pw} />
      <Row style={{ justifyContent: 'center', marginTop: 8 }}>
        <Text variant="small">{t('New to UNRET?')}</Text>
        <Link href="/register"><Text style={{ color: th.brand, fontWeight: '600' }}>{t('Create an account')}</Text></Link>
      </Row>
    </Screen>
  );
}
