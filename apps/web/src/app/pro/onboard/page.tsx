'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2, User } from 'lucide-react';
import { CitySelect, useCategories } from '@/components/domain';
import { Alert, Button, Card, Checkbox, Container, Field, Input, PageHeader, cx } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <RequireAuth><Onboard /></RequireAuth>;
}

function Onboard() {
  const { t } = useT();
  const { me, reload, setMode } = useAuth();
  const router = useRouter();
  const { tree } = useCategories();
  const [f, setF] = useState({ accountType: 'INDIVIDUAL', businessName: '', registrationNumber: '', city: me?.city ?? '', lat: 0, lng: 0, serviceRadiusKm: 25, remoteAvailable: false });
  const [cats, setCats] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me?.professional) { router.replace('/pro'); return null; }

  const toggle = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!cats.length) return setErr(t('Choose at least one service.'));
    if (!f.lat) return setErr(t('Choose your city.'));
    setBusy(true);
    try {
      await api('/professionals/onboard', { body: { ...f, categoryIds: cats, businessName: f.businessName || undefined, registrationNumber: f.registrationNumber || undefined } });
      await reload();
      setMode('professional');
      router.push('/pro');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="max-w-3xl">
      <PageHeader title={t('Offer your services on UNRET')} subtitle={t('Start with the essentials — you can complete your profile later. You keep using the same account as a customer.')} />
      <form onSubmit={submit} className="space-y-5">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">1. {t('Account type')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['INDIVIDUAL', t('Individual professional'), t('Self-employed or freelancer (PFA, II).'), User], ['COMPANY', t('Company / team'), t('A business with employees or several providers.'), Building2]].map(([v, l, d, Icon]) => {
              const I = Icon as typeof User;
              return (
                <button type="button" key={v as string} onClick={() => setF({ ...f, accountType: v as string })} aria-pressed={f.accountType === v}
                  className={cx('rounded-xl border p-4 text-left', f.accountType === v ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-surface-line dark:border-white/15')}>
                  <I className="h-5 w-5 text-brand-700" /><div className="mt-2 font-medium text-ink dark:text-white">{l as string}</div><div className="text-sm text-ink-muted">{d as string}</div>
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.accountType === 'COMPANY' ? t('Company name') : t('Business name (optional)')} required={f.accountType === 'COMPANY'}><Input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} required={f.accountType === 'COMPANY'} /></Field>
            {f.accountType === 'COMPANY' && <Field label={t('Registration number (CUI)')} required><Input value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value })} required /></Field>}
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">2. {t('Which services do you offer?')}</h2>
          {tree.map((p) => (
            <fieldset key={p.id}>
              <legend className="mb-2 text-sm font-medium text-ink-soft dark:text-white/70">{p.icon} {p.name}</legend>
              <div className="flex flex-wrap gap-2">
                {p.children.map((c) => (
                  <button type="button" key={c.id} onClick={() => toggle(c.id)} aria-pressed={cats.includes(c.id)}
                    className={cx('rounded-full border px-3 py-1.5 text-sm', cats.includes(c.id) ? 'border-brand-600 bg-brand-700 text-white' : 'border-surface-line text-ink-soft hover:border-brand-600 dark:border-white/15 dark:text-white/70')}>
                    {c.name}{c.requiredVerifications.includes('QUALIFICATION') && ' 🎓'}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-ink-muted">🎓 {t('Regulated service: you receive requests after your qualification is verified.')}</p>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">3. {t('Where do you work?')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Base city')} required><CitySelect value={f.city} onChange={(c, lat, lng) => setF({ ...f, city: c, lat: lat ?? 0, lng: lng ?? 0 })} /></Field>
            <Field label={t('Travel radius: {n} km', { n: f.serviceRadiusKm })}>
              <input type="range" min={0} max={150} step={5} value={f.serviceRadiusKm} onChange={(e) => setF({ ...f, serviceRadiusKm: Number(e.target.value) })} className="w-full accent-brand-700" />
            </Field>
          </div>
          <Checkbox label={t('I also offer services remotely / online')} checked={f.remoteAvailable} onChange={(e) => setF({ ...f, remoteAvailable: e.target.checked })} />
        </Card>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end"><Button type="submit" size="lg" loading={busy}>{t('Create professional profile')}</Button></div>
      </form>
    </Container>
  );
}
