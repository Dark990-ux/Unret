'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, Check, History, Inbox, MapPin, MessageSquare, Package, Timer } from 'lucide-react';
import { Rating, VerificationBadges } from '@/components/domain';
import { Alert, Avatar, Badge, Button, Card, Container, Empty, Field, KeyValue, Modal, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime, money, responseTime } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <RequireAuth><RequestDetail /></RequireAuth>;
}

function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const router = useRouter();
  const { me } = useAuth();
  const req = useApi<any>(`/requests/${id}`);
  const isOwner = req.data?.viewer === 'customer' || req.data?.viewer === 'admin';
  const offers = useApi<any[]>(isOwner ? `/offers/request/${id}` : null);
  const [accepting, setAccepting] = useState<any | null>(null);
  const [modifying, setModifying] = useState<any | null>(null);
  const [history, setHistory] = useState<any | null>(null);
  const [payment, setPayment] = useState('DIRECT');
  const [message, setMessage] = useState('');
  const act = useAction(async (fn: () => Promise<unknown>) => { await fn(); await Promise.all([req.reload(), offers.reload()]); });

  useEffect(() => { if (req.data?.viewer === 'professional') router.replace(`/pro/requests/${id}`); }, [req.data, id, router]);
  useRealtime('notification', (n: any) => { if (n.data?.requestId === id) { offers.reload(); req.reload(); } });

  if (req.loading) return <PageLoader />;
  if (!req.data) return <Container><Empty title={t('Request not found')} /></Container>;
  const r = req.data;
  if (r.viewer === 'professional') return <PageLoader />;
  const open = ['PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status);

  const message_pro = async (professionalId: string) => {
    const c = await api('/conversations', { body: { professionalId, requestId: id } });
    router.push(`/messages/${c.id}`);
  };

  return (
    <Container>
      <PageHeader title={r.title} back={{ href: '/dashboard', label: t('Dashboard') }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><span>{r.categoryName}</span>{r.publishedAt && <span>· {t('Published {date}', { date: date(r.publishedAt, intl) })}</span>}</span>}
        actions={<>
          {r.status === 'DRAFT' && <Button onClick={() => act.run(() => api(`/requests/${id}/publish`, { method: 'POST' }))} loading={act.pending}>{t('Publish request')}</Button>}
          {r.job && <Button href={`/jobs/${r.job.id}`}>{t('Go to job')}</Button>}
          {(open || r.status === 'DRAFT') && <Button variant="outline" onClick={() => confirm(t('Cancel this request? Pending offers will be declined.')) && act.run(() => api(`/requests/${id}/cancel`, { method: 'POST', body: {} }))}>{t('Cancel request')}</Button>}
        </>} />
      {act.error && <div className="mb-4"><Alert>{act.error}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="order-2 space-y-4 lg:order-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink dark:text-white">{t('Offers')} {offers.data && <span className="text-ink-muted">({offers.data.length})</span>}</h2>
          </div>
          {r.status === 'DRAFT' ? (
            <Empty icon={<Inbox className="h-8 w-8" />} title={t('This request is a draft')} text={t('Publish it to start receiving offers.')} />
          ) : offers.loading ? <PageLoader /> : !offers.data?.length ? (
            <Empty icon={<Timer className="h-8 w-8" />} title={t('Waiting for offers')} text={t('We have notified matching professionals in your area. You will be notified as soon as an offer arrives.')} />
          ) : (
            offers.data.map((o) => {
              const p = o.professional;
              const l = o.latest;
              return (
                <Card key={o.id} className={`p-5 ${o.status === 'ACCEPTED' ? 'ring-2 ring-brand-600' : ''}`}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <Avatar name={p.displayName} url={p.avatarUrl} size={48} />
                      <div className="min-w-0 space-y-1">
                        <Link href={`/pros/${p.id}`} className="font-semibold text-ink hover:text-brand-700 dark:text-white">{p.displayName}</Link>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                          <Rating avg={p.ratingAvg} count={p.ratingCount} />
                          {p.completedJobs > 0 && <span>{t('{n} jobs completed', { n: p.completedJobs })}</span>}
                          {p.avgResponseMinutes != null && <span>{t('Responds in ~{t}', { t: responseTime(p.avgResponseMinutes)! })}</span>}
                        </div>
                        <VerificationBadges badges={p.badges} />
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-2xl font-semibold tabular-nums text-ink dark:text-white">{money(l.priceMinor, l.currency, intl)}</div>
                      <div className="text-sm text-ink-muted">{l.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')}</div>
                      <div className="mt-1 flex flex-wrap gap-1 sm:justify-end"><StatusBadge status={o.expired ? 'EXPIRED' : o.status} />{o.currentRevision > 1 && <Badge tone="blue">{t('Revised (v{n})', { n: o.currentRevision })}</Badge>}</div>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-line text-sm text-ink-soft dark:text-white/75">{l.description}</p>
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex items-start gap-2"><Package className="mt-0.5 h-4 w-4 text-ink-muted" /><span>{l.materialsIncluded ? t('Materials included') : t('Materials not included')}{l.materialsNote ? ` — ${l.materialsNote}` : ''}</span></div>
                    {l.additionalExpenses && <div className="flex items-start gap-2"><span className="text-ink-muted">+</span><span>{t('Additional costs')}: {l.additionalExpenses}</span></div>}
                    <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-ink-muted" /><span>{l.proposedStartAt ? t('Proposed: {date}', { date: dateTime(l.proposedStartAt, intl) }) : p.nextAvailable?.length ? t('Next free: {date}', { date: dateTime(p.nextAvailable[0], intl) }) : t('Time to be agreed')}</span></div>
                    <div className="flex items-start gap-2"><Timer className="mt-0.5 h-4 w-4 text-ink-muted" /><span>{t('Valid until {date}', { date: date(o.expiresAt, intl) })}</span></div>
                  </div>
                  {l.message && <p className="mt-3 rounded-xl bg-surface-sunk p-3 text-sm italic text-ink-soft dark:bg-white/5 dark:text-white/70">“{l.message}”</p>}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-line pt-4 dark:border-white/10">
                    {o.status === 'PENDING' && !o.expired && open && <Button onClick={() => setAccepting(o)}><Check className="h-4 w-4" />{t('Accept offer')}</Button>}
                    {o.status === 'PENDING' && !o.expired && open && <Button variant="outline" onClick={() => setModifying(o)}>{t('Request changes')}</Button>}
                    <Button variant="outline" onClick={() => message_pro(p.id)}><MessageSquare className="h-4 w-4" />{t('Ask a question')}</Button>
                    {o.revisions.length > 1 && <Button variant="ghost" onClick={() => setHistory(o)}><History className="h-4 w-4" />{t('History')}</Button>}
                    {['PENDING', 'MODIFICATION_REQUESTED'].includes(o.status) && open && <Button variant="ghost" className="sm:ml-auto" onClick={() => confirm(t('Decline this offer?')) && act.run(() => api(`/offers/${o.id}/reject`, { body: {} }))}>{t('Decline')}</Button>}
                  </div>
                </Card>
              );
            })
          )}
        </section>

        <aside className="order-1 lg:order-2">
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold text-ink dark:text-white">{t('Request details')}</h2>
            <p className="whitespace-pre-line text-sm text-ink-soft dark:text-white/75">{r.description}</p>
            <KeyValue items={[
              [t('Location'), r.serviceMode === 'REMOTE' ? t('Remote') : <span><MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />{[r.addressText, r.city].filter(Boolean).join(', ')}</span>],
              [t('Preferred date'), r.preferredDate ? `${date(r.preferredDate, intl)}${r.preferredTimeWindow ? ` · ${t(r.preferredTimeWindow[0].toUpperCase() + r.preferredTimeWindow.slice(1))}` : ''}` : t('Flexible')],
              [t('Budget'), r.budgetMinMinor || r.budgetMaxMinor ? `${r.budgetMinMinor ? money(r.budgetMinMinor, r.currency, intl) : ''}${r.budgetMinMinor && r.budgetMaxMinor ? ' – ' : ''}${r.budgetMaxMinor ? money(r.budgetMaxMinor, r.currency, intl) : ''}` : t('Not specified')],
              [t('Urgency'), t({ LOW: 'Not urgent', NORMAL: 'Normal', HIGH: 'Soon', EMERGENCY: 'Emergency' }[r.urgency as string] ?? r.urgency)],
              ...(r.expiresAt && open ? [[t('Open until'), date(r.expiresAt, intl)] as [string, string]] : []),
            ]} />
            {r.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {r.attachments.map((a: any) => a.mimeType === 'application/pdf'
                  ? <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-sunk text-xs">PDF</a>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.fileName} className="h-16 w-16 rounded-lg object-cover" /></a>)}
              </div>
            )}
          </Card>
        </aside>
      </div>

      <Modal open={!!accepting} onClose={() => setAccepting(null)} title={t('Accept this offer?')}>
        {accepting && (
          <div className="space-y-4">
            <Alert tone="blue">{t('Accepting creates a job agreement for {price} with {name}. Other offers will be declined. Any later change to price or scope must be approved by both of you.', { price: money(accepting.latest.priceMinor, accepting.latest.currency, intl), name: accepting.professional.displayName })}</Alert>
            <Field label={t('How will you pay?')}>
              <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="DIRECT">{t('Directly to the professional (cash, transfer)')}</option>
                <option value="PLATFORM">{t('Online through UNRET')}</option>
              </Select>
            </Field>
            {payment === 'DIRECT' && <p className="text-xs text-ink-muted">{t('UNRET records the agreed price and payment method but does not process or guarantee direct payments.')}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAccepting(null)}>{t('Cancel')}</Button>
              <Button loading={act.pending} onClick={async () => {
                const o = accepting;
                setAccepting(null);
                let jobId: string | undefined;
                await act.run(async () => { jobId = (await api(`/offers/${o.id}/accept`, { body: { revision: o.currentRevision, paymentMethod: payment } })).id; });
                if (jobId) router.push(`/jobs/${jobId}`);
              }}>{t('Accept offer')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!modifying} onClose={() => setModifying(null)} title={t('Request changes to the offer')}>
        <div className="space-y-4">
          <Field label={t('What would you like changed?')}><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('e.g. Could you include materials? Is Saturday possible?')} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModifying(null)}>{t('Cancel')}</Button>
            <Button disabled={message.trim().length < 5} onClick={async () => { const o = modifying; setModifying(null); await act.run(() => api(`/offers/${o.id}/request-modification`, { body: { message } })); setMessage(''); }}>{t('Send')}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} title={t('Offer history')} wide>
        {history && (
          <ol className="space-y-3">
            {history.revisions.map((v: any) => (
              <li key={v.id} className="rounded-xl border border-surface-line p-3 text-sm dark:border-white/10">
                <div className="flex justify-between font-medium"><span>v{v.revision}{v.revision === 1 ? ` · ${t('Original quotation')}` : ''}</span><span>{money(v.priceMinor, v.currency, intl)}</span></div>
                <div className="text-xs text-ink-muted">{dateTime(v.createdAt, intl)} · {v.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')}</div>
                <p className="mt-1 text-ink-soft dark:text-white/70">{v.description}</p>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </Container>
  );
}
