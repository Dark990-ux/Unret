'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MapPin, Wifi, X } from 'lucide-react';
import { CategorySelect, CitySelect, useCategories } from '@/components/domain';
import { Alert, Button, Card, Container, Field, FileUpload, Input, PageHeader, PageLoader, Select, Textarea } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { Method, PaymentMethodPicker } from '@/components/payment';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { majorToMinor } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { AvailabilityPicker, When, whenBody, whenOk } from '@/components/availability-picker';

function NewRequest() {
  const { t } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const { flat } = useCategories();
  const [when, setWhen] = useState<When>({ mode: 'any', days: [], dates: [] });
  const [f, setF] = useState({
    categoryId: sp.get('category') ?? '', title: '', description: '', serviceMode: 'ON_SITE', city: me?.city ?? '', lat: undefined as number | undefined, lng: undefined as number | undefined,
    addressText: me?.addressText ?? '', preferredDate: '', preferredTimeWindow: '', budgetMin: '', budgetMax: '', urgency: 'NORMAL',
  });
  const [payment, setPayment] = useState<Method | null>(null);
  const [files, setFiles] = useState<{ key: string; name: string; url: string; mime: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const cat = useMemo(() => flat.find((c) => c.id === f.categoryId), [flat, f.categoryId]);

  useEffect(() => {
    if (f.city && f.lat === undefined) {
      import('@unret/shared').then(({ CITIES }) => {
        const c = CITIES.find((x) => x.name === f.city);
        if (c) setF((s) => ({ ...s, lat: c.lat, lng: c.lng }));
      });
    }
  }, [f.city, f.lat]);

  const submit = async (publish: boolean) => {
    setErr(null);
    setBusy(publish ? 'publish' : 'draft');
    try {
      const r = await api('/requests', {
        body: {
          categoryId: f.categoryId, title: f.title, description: f.description, serviceMode: f.serviceMode,
          city: f.serviceMode === 'REMOTE' ? undefined : f.city, lat: f.serviceMode === 'REMOTE' ? undefined : f.lat, lng: f.serviceMode === 'REMOTE' ? undefined : f.lng,
          addressText: f.serviceMode === 'REMOTE' ? undefined : f.addressText || undefined,
          ...whenBody(when), preferredTimeWindow: f.preferredTimeWindow || undefined,
          budgetMinMinor: f.budgetMin ? majorToMinor(f.budgetMin) : undefined, budgetMaxMinor: f.budgetMax ? majorToMinor(f.budgetMax) : undefined,
          urgency: f.urgency, attachmentKeys: files.map((x) => x.key), publish, paymentMethod: payment ?? undefined,
        },
      });
      router.push(`/requests/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Container className="max-w-3xl">
      <PageHeader title={t('Post a request')} subtitle={t('Free and without obligation. Matching professionals will send you offers.')} back={{ href: '/dashboard', label: t('Dashboard') }} />
      <form onSubmit={(e) => { e.preventDefault(); submit(true); }} className="space-y-5">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">1. {t('What do you need?')}</h2>
          <Field label={t('Service')} required><CategorySelect value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} required /></Field>
          {cat && cat.requiredVerifications.includes('QUALIFICATION') && <Alert tone="blue">{t('This service is regulated. Your request will only be sent to professionals with a verified qualification.')}</Alert>}
          <Field label={t('Title')} hint={t('e.g. “Install 5 new sockets in the living room”')} required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} minLength={5} maxLength={140} required /></Field>
          <Field label={t('Description')} hint={t('Describe the job: what, how much, any details that help professionals quote accurately.')} required>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} minLength={20} maxLength={5000} required />
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink dark:text-white">{t('Photos or documents')}</span>
            <div className="flex flex-wrap items-center gap-2">
              {files.map((x) => (
                <span key={x.key} className="relative">
                  {x.mime.startsWith('image') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.url} alt={x.name} className="h-16 w-16 rounded-lg object-cover" />
                  ) : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-sunk text-xs">PDF</span>}
                  <button type="button" onClick={() => setFiles(files.filter((y) => y.key !== x.key))} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-white" aria-label={t('Remove')}><X className="h-3 w-3" /></button>
                </span>
              ))}
              {files.length < 10 && <FileUpload purpose="request" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onUploaded={(x) => setFiles((s) => [...s, x])} label={t('Add photos')} />}
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">2. {t('Where?')}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {[['ON_SITE', t('At my location'), MapPin], ...(cat?.remoteAllowed ? [['REMOTE', t('Remote / online'), Wifi], ['EITHER', t('Either is fine'), MapPin]] : [])].map(([v, l, Icon]) => {
              const I = Icon as typeof MapPin;
              return (
                <button type="button" key={v as string} onClick={() => setF({ ...f, serviceMode: v as string })} aria-pressed={f.serviceMode === v}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${f.serviceMode === v ? 'border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' : 'border-surface-line text-ink-soft dark:border-white/15 dark:text-white/70'}`}>
                  <I className="h-4 w-4" />{l as string}
                </button>
              );
            })}
          </div>
          {f.serviceMode !== 'REMOTE' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('City')} required><CitySelect value={f.city} onChange={(c, lat, lng) => setF({ ...f, city: c, lat, lng })} /></Field>
              <Field label={t('Address')} hint={t('Only shared with the professional you hire.')}><Input value={f.addressText} onChange={(e) => setF({ ...f, addressText: e.target.value })} autoComplete="street-address" /></Field>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">3. {t('When and budget')}</h2>
          <AvailabilityPicker value={when} onChange={setWhen} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('Time of day')}>
              <Select value={f.preferredTimeWindow} onChange={(e) => setF({ ...f, preferredTimeWindow: e.target.value })}>
                <option value="">{t('Any time')}</option><option value="morning">{t('Morning')}</option><option value="afternoon">{t('Afternoon')}</option><option value="evening">{t('Evening')}</option>
              </Select>
            </Field>
            <Field label={t('Urgency')}>
              <Select value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })}>
                <option value="LOW">{t('Not urgent')}</option><option value="NORMAL">{t('Normal')}</option><option value="HIGH">{t('Soon')}</option><option value="EMERGENCY">{t('Emergency')}</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Budget from (RON)')} hint={t('Optional')}><Input type="number" min={0} step="1" value={f.budgetMin} onChange={(e) => setF({ ...f, budgetMin: e.target.value })} /></Field>
            <Field label={t('Budget up to (RON)')} hint={t('Optional')}><Input type="number" min={0} step="1" value={f.budgetMax} onChange={(e) => setF({ ...f, budgetMax: e.target.value })} /></Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">4. {t('How will you pay?')}</h2>
          <PaymentMethodPicker value={payment} onChange={setPayment} />
        </Card>

        {err && <Alert>{err}</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => router.back()} className="sm:mr-auto">‹ {t('Back')}</Button>
          <Button type="button" variant="outline" loading={busy === 'draft'} disabled={!f.categoryId || !f.title} onClick={() => submit(false)}>{t('Save as draft')}</Button>
          <Button type="submit" size="lg" loading={busy === 'publish'} disabled={!payment || !whenOk(when)} title={!payment ? t('Choose how you will pay to publish the request.') : !whenOk(when) ? t('Choose the days when you are available.') : undefined}>{t('Publish request')}</Button>
        </div>
      </form>
    </Container>
  );
}

export default function Page() {
  return <RequireAuth><Suspense fallback={<PageLoader />}><NewRequest /></Suspense></RequireAuth>;
}
