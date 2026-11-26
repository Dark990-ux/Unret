'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, Container, Field, Input } from '@/components/ui-exports';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Container className="max-w-md py-12">
      <Card className="space-y-4 p-6">
        <h1 className="text-xl font-semibold text-ink dark:text-white">{t('Forgot your password?')}</h1>
        {sent ? (
          <Alert tone="green">{t('If an account exists for {email}, we sent a link to set a new password. Check your inbox (and spam folder). The link works for one hour.', { email })}</Alert>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api('/auth/password/forgot', { body: { email } }); setSent(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
            <p className="text-sm text-ink-soft dark:text-white/70">{t('Enter the email you use for UNRET and we will send you a link to set a new password.')}</p>
            <Field label={t('Email')} required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
            {err && <Alert>{err}</Alert>}
            <Button type="submit" className="w-full" loading={busy}>{t('Send me a link')}</Button>
          </form>
        )}
        <p className="text-center text-sm"><Link href="/login" className="text-brand-700 hover:underline">{t('Back to sign in')}</Link> · <Link href="/help/new?kind=question&category=account" className="text-brand-700 hover:underline">{t('Still stuck? Contact us')}</Link></p>
      </Card>
    </Container>
  );
}
