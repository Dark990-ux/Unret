'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, MapPin, MessageSquare, ThumbsDown, Wifi } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, KeyValue, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date, dateTime, fromLocalInput, majorToMinor, money, toLocalInput } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><ProRequest /></ProShell>;
}

function ProRequest() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const router = useRouter();
  const { data: r, loading, reload } = useApi<any>(`/requests/${id}`);
  const [editing, setEditing] = useState(false);

  if (loading) return <PageLoader />;
  if (!r) return <Empty title={t('Request not found')} />;
  const offer = r.myOffer;
  const latest = offer?.revisions?.[0];
  const open = ['PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status);
  const canEdit = offer && ['PENDING', 'MODIFICATION_REQUESTED'].includes(offer.status) && open;

  const ask = async () => {
    const c = await api('/conversations', { body: { requestId: id } });
    router.push(`/messages/${c.id}`);
  };

  return (
    <>
      <PageHeader title={r.title} back={{ href: '/pro/requests', label: t('Requests') }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} />{r.categoryName}</span>}
        actions={<>
          <Button variant="outline" onClick={ask}><MessageSquare className="h-4 w-4" />{t('Ask the customer')}</Button>
          {!offer && open && !r.match?.declined && <Button variant="ghost" onClick={async () => { await api(`/requests/${id}/decline`, { method: 'POST' }); router.push('/pro/requests'); }}><ThumbsDown className="h-4 w-4" />{t('Not interested')}</Button>}
          {r.job && <Button href={`/jobs/${r.job.id}`}>{t('Go to job')}</Button>}
        </>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="space-y-4 p-5 sm:p-6">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft dark:text-white/80">{r.description}</p>
          <KeyValue items={[
            [t('Customer'), r.customer.name],
            [t('Location'), r.serviceMode === 'REMOTE' ? <span key="r" className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{t('Remote')}</span> : <span key="l" className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.addressText ? `${r.addressText}, ` : ''}{r.city}{r.match?.distanceKm != null ? ` · ${Math.round(r.match.distanceKm)} km` : ''}</span>],
            [t('Preferred date'), r.preferredDate ? `${date(r.preferredDate, intl)}${r.preferredTimeWindow ? ` · ${t(r.preferredTimeWindow[0].toUpperCase() + r.preferredTimeWindow.slice(1))}` : ''}` : t('Flexible')],
            [t('Budget'), r.budgetMinMinor || r.budgetMaxMinor ? [r.budgetMinMinor && money(r.budgetMinMinor, r.currency, intl), r.budgetMaxMinor && money(r.budgetMaxMinor, r.currency, intl)].filter(Boolean).join(' – ') : t('Not specified')],
            [t('Offers so far'), r.offerCount],
            [t('Open until'), date(r.expiresAt, intl)],
          ]} />
          {!r.addressText && r.serviceMode !== 'REMOTE' && <p className="text-xs text-ink-muted">{t('The exact address is shared once your offer is accepted.')}</p>}
          {r.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.attachments.map((a: any) => a.mimeType === 'application/pdf'
                ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-sunk text-xs">PDF</a>
                // eslint-disable-next-line @next/next/no-img-element
                : <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.fileName} className="h-20 w-20 rounded-lg object-cover" /></a>)}
            </div>
          )}
        </Card>

        <div>
          {offer && !editing ? (
            <Card className="space-y-3 p-5">
              <div className="flex items-center justify-between"><h2 className="font-semibold text-ink dark:text-white">{t('Your offer')}</h2><StatusBadge status={offer.status} /></div>
              {offer.status === 'MODIFICATION_REQUESTED' && <Alert tone="amber">{t('The customer asked for changes. Check your messages, then revise the offer.')}</Alert>}
              <div className="text-2xl font-semibold">{money(latest.priceMinor, latest.currency, intl)} <span className="text-sm font-normal text-ink-muted">{latest.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')} · v{offer.currentRevision}</span></div>
              <p className="whitespace-pre-line text-sm text-ink-soft dark:text-white/75">{latest.description}</p>
              {latest.proposedStartAt && <p className="inline-flex items-center gap-1.5 text-sm"><CalendarDays className="h-4 w-4" />{dateTime(latest.proposedStartAt, intl)}</p>}
              <p className="text-xs text-ink-muted">{t('Valid until {date}', { date: date(offer.expiresAt, intl) })}</p>
              {canEdit && (
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => setEditing(true)}>{t('Revise offer')}</Button>
                  <Button variant="ghost" onClick={async () => { if (confirm(t('Withdraw your offer?'))) { await api(`/offers/${offer.id}/withdraw`, { method: 'POST' }); reload(); } }}>{t('Withdraw')}</Button>
                </div>
              )}
            </Card>
          ) : open && !r.match?.declined ? (
            <OfferForm requestId={id} currency={r.currency} existing={editing ? { offer, latest } : null} onDone={() => { setEditing(false); reload(); }} onCancel={editing ? () => setEditing(false) : undefined} />
          ) : (
            <Card className="p-5 text-sm text-ink-muted">{r.match?.declined ? t('You marked this request as not interesting.') : t('This request is no longer accepting offers.')}</Card>
          )}
        </div>
      </div>
    </>
  );
}

function OfferForm({ requestId, currency, existing, onDone, onCancel }: { requestId: string; currency: string; existing: { offer: any; latest: any } | null; onDone: () => void; onCancel?: () => void }) {
  const { t } = useT();
  const l = existing?.latest;
  const defaultExpiry = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState({
    price: l ? String(l.priceMinor / 100) : '', priceType: l?.priceType ?? 'FIXED', description: l?.description ?? '', materialsIncluded: l?.materialsIncluded ?? false,
    materialsNote: l?.materialsNote ?? '', additionalExpenses: l?.additionalExpenses ?? '', start: toLocalInput(l?.proposedStartAt), end: toLocalInput(l?.proposedEndAt),
    expiresAt: existing ? existing.offer.expiresAt.slice(0, 10) : defaultExpiry, message: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      priceMinor: majorToMinor(f.price), priceType: f.priceType, description: f.description, materialsIncluded: f.materialsIncluded,
      materialsNote: f.materialsNote || undefined, additionalExpenses: f.additionalExpenses || undefined,
      proposedStartAt: fromLocalInput(f.start), proposedEndAt: fromLocalInput(f.end), message: f.message || undefined,
      expiresAt: new Date(f.expiresAt + 'T23:59:00').toISOString(),
    };
    try {
      if (existing) await api(`/offers/${existing.offer.id}/revise`, { body });
      else await api('/offers', { body: { ...body, requestId } });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-ink dark:text-white">{existing ? t('Revise your offer') : t('Send an offer')}</h2>
      {existing && <div className="mb-4"><Alert tone="blue">{t('A new version is created; the customer sees the full history.')}</Alert></div>}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={t('Price ({cur})', { cur: currency })} required><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></Field>
          <Field label={t('Type')}>
            <Select value={f.priceType} onChange={(e) => setF({ ...f, priceType: e.target.value })}><option value="FIXED">{t('Fixed price')}</option><option value="ESTIMATED">{t('Estimate')}</option></Select>
          </Field>
        </div>
        <Field label={t('What is included')} required><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} minLength={10} required placeholder={t('Describe the work you will do for this price.')} /></Field>
        <Checkbox label={t('Materials included in the price')} checked={f.materialsIncluded} onChange={(e) => setF({ ...f, materialsIncluded: e.target.checked })} />
        <Field label={t('Materials notes')}><Input value={f.materialsNote} onChange={(e) => setF({ ...f, materialsNote: e.target.value })} placeholder={t('e.g. customer buys the sockets')} /></Field>
        <Field label={t('Additional expenses')}><Input value={f.additionalExpenses} onChange={(e) => setF({ ...f, additionalExpenses: e.target.value })} placeholder={t('e.g. transport 50 RON outside the city')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Proposed start')}><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label={t('Proposed end')}><Input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Field label={t('Offer valid until')}><Input type="date" min={new Date().toISOString().slice(0, 10)} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
        {!existing && <Field label={t('Message to the customer')}><Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} className="min-h-[70px]" /></Field>}
        {err && <Alert>{err}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="flex-1">{existing ? t('Send revised offer') : t('Send offer')}</Button>
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>}
        </div>
        <p className="text-xs text-ink-muted"><Badge tone="gray">{t('Tip')}</Badge> {t('Clear offers that list what is included are accepted more often.')}</p>
      </form>
    </Card>
  );
}
