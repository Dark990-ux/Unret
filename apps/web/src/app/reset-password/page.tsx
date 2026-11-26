'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Container, Field, Input } from '@/components/ui-exports';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function ResetPassword() {
  const { t } = useT();
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') ?? ''); }, []);
  return (
    <Container className="max-w-md py-12">
      <Card className="space-y-4 p-6">
        <h1 className="text-xl font-semibold text-ink dark:text-white">{t('Set a new password')}</h1>
        {done ? (
          <>
            <Alert tone="green">{t('Your password was changed. For your safety you were signed out on all devices.')}</Alert>
            <Button href="/login" className="w-full">{t('Sign in')}</Button>
          </>
        ) : (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (pw !== pw2) return setErr(t('The two passwords are different.'));
            setBusy(true); setErr(null);
            try { await api('/auth/password/reset', { body: { token, password: pw } }); setDone(true); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
          }}>
            <Field label={t('New password')} required hint={t('At least 10 characters.')}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} autoComplete="new-password" /></Field>
            <Field label={t('Repeat the new password')} required><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={10} autoComplete="new-password" /></Field>
            {err && <Alert>{err} {/no longer valid/i.test(err) && <Link href="/forgot-password" className="underline">{t('Ask for a new link')}</Link>}</Alert>}
            <Button type="submit" className="w-full" loading={busy} disabled={!token}>{t('Save new password')}</Button>
          </form>
        )}
      </Card>
    </Container>
  );
}
