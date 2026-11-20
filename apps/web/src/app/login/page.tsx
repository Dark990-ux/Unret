'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, Field, Input, PageLoader } from '@/components/ui';
import { Logo } from '@/components/shell';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

function Login() {
  const { t } = useT();
  const { login } = useAuth();
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam || '/dashboard';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await login(identifier, password, mfa ? mfaCode : undefined);
      if (r.mfaRequired) setMfa(true);
      else router.push(nextParam?.startsWith('/') ? nextParam : r.professional ? '/pro' : '/dashboard');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-6 sm:p-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold text-ink dark:text-white">{t('Welcome back')}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {!mfa ? (
            <>
              <Field label={t('Email or phone')}><Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></Field>
              <Field label={t('Password')}><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            </>
          ) : (
            <Field label={t('Verification code')} hint={t('Enter the 6-digit code from your authenticator app.')}>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </Field>
          )}
          {err && <Alert>{err}</Alert>}
          <Button type="submit" className="w-full" size="lg" loading={busy}>{mfa ? t('Verify') : t('Sign in')}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-muted">
          {t('New to UNRET?')} <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">{t('Create an account')}</Link>
        </p>
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><Login /></Suspense>;
}
