'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, Checkbox, Field, Input, PageLoader, Select, Tabs } from '@/components/ui';
import { Logo } from '@/components/shell';
import { api, saveSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

function Register() {
  const { t, locale } = useT();
  const { reload } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const { data: countries } = useApi<{ code: string; name: string; phonePrefix: string }[]>('/countries');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', countryCode: 'RO', acceptTerms: false });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const tokens = await api('/auth/register', {
        body: { name: f.name, password: f.password, countryCode: f.countryCode, acceptTerms: f.acceptTerms, preferredLanguage: locale, ...(method === 'email' ? { email: f.email } : { phone: f.phone.replace(/\s/g, '') }) },
      });
      saveSession(tokens);
      await reload();
      router.push(next.startsWith('/') ? next : '/dashboard');
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
        <h1 className="mt-6 text-2xl font-semibold text-ink dark:text-white">{t('Create your account')}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t('One account to request services — and to offer them, if you want.')}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label={t('Full name')} required><Input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></Field>
          <Tabs value={method} onChange={setMethod} items={[{ value: 'email', label: t('Email') }, { value: 'phone', label: t('Phone') }]} />
          {method === 'email' ? (
            <Field label={t('Email')} required><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          ) : (
            <Field label={t('Phone')} hint={t('International format, e.g. +40712345678')} required><Input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+40" required /></Field>
          )}
          <Field label={t('Password')} hint={t('At least 10 characters.')} required><Input type="password" autoComplete="new-password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          <Field label={t('Country')} required>
            <Select value={f.countryCode} onChange={(e) => setF({ ...f, countryCode: e.target.value })}>
              {(countries ?? [{ code: 'RO', name: 'România', phonePrefix: '+40' }]).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Checkbox checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} required
            label={<>{t('I accept the')} <Link href="/terms" className="text-brand-700 underline" target="_blank">{t('Terms of service')}</Link> {t('and the')} <Link href="/privacy" className="text-brand-700 underline" target="_blank">{t('Privacy policy')}</Link>.</>} />
          {err && <Alert>{err}</Alert>}
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!f.acceptTerms}>{t('Create account')}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-muted">{t('Already have an account?')} <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">{t('Sign in')}</Link></p>
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><Register /></Suspense>;
}
