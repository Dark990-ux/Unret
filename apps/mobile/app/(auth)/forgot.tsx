import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function Forgot() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen>
      <Text variant="title">{t('Forgot your password?')}</Text>
      <Card>
        {sent ? <Alert tone="green">{t('If an account exists for {email}, we sent a link to set a new password. Check your inbox (and spam folder). The link works for one hour.', { email })}</Alert> : (
          <>
            <Text variant="small">{t('Enter the email you use for UNRET and we will send you a link to set a new password.')}</Text>
            <Field label={t('Email')} required><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" accessibilityLabel={t('Email')} /></Field>
            {err && <Alert>{err}</Alert>}
            <Button title={t('Send me a link')} loading={busy} disabled={!/.+@.+\..+/.test(email)} onPress={async () => { setBusy(true); setErr(null); try { await api('/auth/password/forgot', { body: { email } }); setSent(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }} />
          </>
        )}
        <Button small variant="ghost" title={t('Back to sign in')} onPress={() => router.replace('/login')} />
        <Button small variant="ghost" title={t('Still stuck? Contact us')} onPress={() => router.push({ pathname: '/help/new', params: { kind: 'question', category: 'account' } })} />
      </Card>
    </Screen>
  );
}
