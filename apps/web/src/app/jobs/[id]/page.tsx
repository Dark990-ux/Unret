'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, CalendarDays, Check, CreditCard, FileText, MessageSquare, Pencil, Play, Scale, Star, Wallet, X } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, Container, Empty, Field, Input, KeyValue, Modal, PageHeader, PageLoader, Select, StarInput, StatusBadge, Textarea } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, fromLocalInput, majorToMinor, money, toLocalInput } from '@/lib/format';
import { useAction, useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

const STEPS = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];

export default function Page() {
  return <RequireAuth><JobDetail /></RequireAuth>;
}

function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const { me } = useAuth();
  const { data: j, loading, reload, setData } = useApi<any>(`/jobs/${id}`);
  const act = useAction(async (path: string, body?: unknown) => { setData(await api(path, { method: 'POST', body: body ?? {} })); });
  const [modal, setModal] = useState<null | 'change' | 'cancel' | 'dispute' | 'review' | 'payment'>(null);
  useRealtime('notification', (n: any) => n.data?.jobId === id && reload());

  if (loading) return <PageLoader />;
  if (!j) return <Container><Empty title={t('Job not found')} /></Container>;
  const can = (a: string) => j.allowedActions.includes(a);
  const isCustomer = j.viewerRole === 'customer';
  const counterpart = isCustomer ? { name: j.professional.displayName, url: j.professional.avatarUrl, sub: t('Professional'), link: `/pros/${j.professional.id}`, phone: j.professional.user.phone, email: j.professional.user.email }
    : { name: j.customer.name, url: j.customer.avatarUrl, sub: t('Customer'), link: null, phone: j.customer.phone, email: j.customer.email };
  const pending = j.changes.find((c: any) => c.status === 'PROPOSED');
  const stepIdx = STEPS.indexOf(j.status);
  const paidOnline = j.payments.find((p: any) => p.method === 'PLATFORM' && p.status === 'SUCCEEDED');

  return (
    <Container>
      <PageHeader title={j.request.title} back={{ href: isCustomer ? '/jobs' : '/jobs?as=professional', label: t('Jobs') }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={j.status} /><span>{j.categoryName}</span></span>}
        actions={<>
          {j.conversationId && <Button variant="outline" href={`/messages/${j.conversationId}`}><MessageSquare className="h-4 w-4" />{t('Messages')}</Button>}
          {can('start') && <Button onClick={() => act.run(`/jobs/${id}/start`)} loading={act.pending}><Play className="h-4 w-4" />{t('Start work')}</Button>}
          {can('confirm_completion') && <Button onClick={() => act.run(`/jobs/${id}/confirm-completion`)} loading={act.pending}><Check className="h-4 w-4" />{isCustomer ? t('Confirm job is done') : t('Mark as finished')}</Button>}
          {can('review') && <Button onClick={() => setModal('review')}><Star className="h-4 w-4" />{t('Leave a review')}</Button>}
        </>} />
      {act.error && <div className="mb-4"><Alert>{act.error}</Alert></div>}

      {!['CANCELLED', 'DISPUTED'].includes(j.status) && (
        <ol className="mb-6 grid grid-cols-4 gap-2" aria-label={t('Job progress')}>
          {STEPS.map((s, i) => (
            <li key={s} className="space-y-1.5">
              <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-surface-line dark:bg-white/10'}`} />
              <div className={`text-xs ${i <= stepIdx ? 'font-medium text-ink dark:text-white' : 'text-ink-muted'}`}>{t({ ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' }[s]!)}</div>
            </li>
          ))}
        </ol>
      )}
      {j.status === 'IN_PROGRESS' && (j.professionalConfirmedAt || j.customerConfirmedAt) && (
        <div className="mb-4"><Alert tone="blue">
          {j.professionalConfirmedAt && !j.customerConfirmedAt && (isCustomer ? t('The professional marked the job as finished. Please confirm, or open a dispute if something is wrong. Without a response the job completes automatically after 7 days.') : t('Waiting for the customer to confirm completion.'))}
          {j.customerConfirmedAt && !j.professionalConfirmedAt && (isCustomer ? t('Waiting for the professional to confirm completion.') : t('The customer confirmed the job is finished. Please confirm completion.'))}
        </Alert></div>
      )}
      {j.status === 'DISPUTED' && <div className="mb-4"><Alert tone="amber">{t('This job is in dispute. The UNRET team is reviewing it and will contact both parties.')}</Alert></div>}

      {pending && (
        <Card className="mb-6 border-amber-300 p-5 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <Pencil className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="font-semibold text-ink dark:text-white">{t('Proposed change to the agreement')}</h2>
              <p className="text-sm text-ink-soft dark:text-white/70">{t('Proposed by {name}', { name: pending.proposedBy.name })}: “{pending.reason}”</p>
              <ul className="space-y-1 text-sm">
                {pending.priceMinor != null && <li>{t('Price')}: <s className="text-ink-muted">{money(pending.previous.priceMinor, j.currency, intl)}</s> → <b>{money(pending.priceMinor, j.currency, intl)}</b></li>}
                {pending.scope && <li>{t('New scope')}: {pending.scope}</li>}
                {pending.scheduledStartAt && <li>{t('Appointment')}: <b>{dateTime(pending.scheduledStartAt, intl)} – {new Date(pending.scheduledEndAt).toLocaleTimeString(intl, { timeStyle: 'short' })}</b></li>}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                {pending.proposedBy.id === me?.id ? (
                  <><Badge tone="amber">{t('Waiting for the other party')}</Badge><Button size="sm" variant="ghost" onClick={() => act.run(`/jobs/${id}/changes/${pending.id}/withdraw`)}>{t('Withdraw')}</Button></>
                ) : (
                  <><Button size="sm" onClick={() => act.run(`/jobs/${id}/changes/${pending.id}/respond`, { decision: 'accept' })}>{t('Accept change')}</Button>
                    <Button size="sm" variant="outline" onClick={() => act.run(`/jobs/${id}/changes/${pending.id}/respond`, { decision: 'reject' })}>{t('Decline')}</Button></>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink dark:text-white">{t('Agreement')}</h2>
              {can('propose_change') && !pending && <Button size="sm" variant="outline" onClick={() => setModal('change')}><Pencil className="h-3.5 w-3.5" />{t('Propose a change')}</Button>}
            </div>
            <KeyValue items={[
              [t('Agreed price'), <span key="p" className="text-lg">{money(j.agreedPriceMinor, j.currency, intl)} <span className="text-sm font-normal text-ink-muted">({j.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')})</span></span>],
              [t('Appointment'), j.scheduledStartAt ? `${dateTime(j.scheduledStartAt, intl)} – ${new Date(j.scheduledEndAt).toLocaleTimeString(intl, { timeStyle: 'short' })}` : t('To be agreed — propose a time')],
              [t('Payment'), j.paymentMethod === 'PLATFORM' ? t('Online through UNRET') : t('Directly to the professional')],
              [t('Location'), j.request.serviceMode === 'REMOTE' ? t('Remote') : [j.request.addressText, j.request.city].filter(Boolean).join(', ')],
            ]} />
            <div className="mt-4 border-t border-surface-line pt-4 dark:border-white/10">
              <div className="mb-1 text-sm text-ink-muted">{t('Scope of work')}</div>
              <p className="whitespace-pre-line text-sm text-ink dark:text-white/85">{j.scope}</p>
              {j.acceptedRevision.materialsIncluded !== undefined && <p className="mt-2 text-sm text-ink-soft">{j.acceptedRevision.materialsIncluded ? t('Materials included') : t('Materials not included')}{j.acceptedRevision.materialsNote ? ` — ${j.acceptedRevision.materialsNote}` : ''}</p>}
              {j.acceptedRevision.additionalExpenses && <p className="text-sm text-ink-soft">{t('Additional costs')}: {j.acceptedRevision.additionalExpenses}</p>}
            </div>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-brand-700">{t('Original quotation and revisions ({n})', { n: j.offer.revisions.length })}</summary>
              <ol className="mt-3 space-y-2">
                {j.offer.revisions.map((v: any) => (
                  <li key={v.id} className="rounded-xl bg-surface-sunk p-3 dark:bg-white/5">
                    <div className="flex justify-between font-medium"><span>v{v.revision}{v.id === j.acceptedRevisionId ? ` · ${t('accepted')}` : ''}</span><span>{money(v.priceMinor, v.currency, intl)}</span></div>
                    <div className="text-xs text-ink-muted">{dateTime(v.createdAt, intl)}</div>
                    <p className="mt-1 text-ink-soft dark:text-white/70">{v.description}</p>
                  </li>
                ))}
              </ol>
            </details>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink dark:text-white">{t('Payments')}</h2>
              <div className="flex gap-2">
                {can('pay_online') && !paidOnline && <Button size="sm" onClick={() => setModal('payment')}><CreditCard className="h-3.5 w-3.5" />{t('Pay online')}</Button>}
                {can('record_payment') && <Button size="sm" variant="outline" onClick={() => setModal('payment')}><Wallet className="h-3.5 w-3.5" />{t('Record direct payment')}</Button>}
              </div>
            </div>
            {!j.payments.length ? <p className="text-sm text-ink-muted">{t('No payments recorded yet.')}</p> : (
              <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">
                {j.payments.map((p: any) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span>{p.method === 'PLATFORM' ? t('Online payment') : t('Direct payment')}{p.paymentMethodNote ? ` · ${p.paymentMethodNote}` : ''} · <span className="text-ink-muted">{dateTime(p.createdAt, intl)}</span></span>
                    <span className="flex items-center gap-2"><b className="tabular-nums">{money(p.grossMinor, p.currency, intl)}</b><StatusBadge status={p.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {j.review && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-2 font-semibold text-ink dark:text-white">{t('Review')}</h2>
              <div className="flex items-center gap-2"><span className="text-accent-500">{'★'.repeat(j.review.overall)}</span><Badge tone="green">{t('Verified job')}</Badge></div>
              {j.review.text && <p className="mt-2 text-sm text-ink-soft dark:text-white/75">{j.review.text}</p>}
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold text-ink dark:text-white">{t('Timeline')}</h2>
            <ol className="relative space-y-4 border-l border-surface-line pl-5 dark:border-white/10">
              {j.events.map((e: any) => (
                <li key={e.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <div className="font-medium text-ink dark:text-white">{eventLabel(e, t)}</div>
                  <div className="text-xs text-ink-muted">{dateTime(e.createdAt, intl)}{e.actor ? ` · ${e.actor.name}` : ''}</div>
                  {e.note && <div className="text-ink-soft dark:text-white/70">{e.note}</div>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={counterpart.name} url={counterpart.url} size={48} />
              <div className="min-w-0">
                {counterpart.link ? <Link href={counterpart.link} className="font-semibold text-ink hover:text-brand-700 dark:text-white">{counterpart.name}</Link> : <div className="font-semibold text-ink dark:text-white">{counterpart.name}</div>}
                <div className="text-sm text-ink-muted">{counterpart.sub}</div>
              </div>
            </div>
            <dl className="mt-4 space-y-1 text-sm">
              {counterpart.phone && <div><dt className="inline text-ink-muted">{t('Phone')}: </dt><dd className="inline"><a href={`tel:${counterpart.phone}`} className="text-brand-700">{counterpart.phone}</a></dd></div>}
              {counterpart.email && <div className="truncate"><dt className="inline text-ink-muted">{t('Email')}: </dt><dd className="inline">{counterpart.email}</dd></div>}
            </dl>
          </Card>
          {j.viewerRole === 'professional' && j.company && <AssignCard job={j} onDone={setData} />}
          {j.request.attachments.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-2 text-sm font-semibold text-ink dark:text-white">{t('Attachments')}</h3>
              <ul className="space-y-1 text-sm">{j.request.attachments.map((a: any) => <li key={a.id}><a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-700"><FileText className="h-4 w-4" />{a.fileName}</a></li>)}</ul>
            </Card>
          )}
          <Card className="space-y-2 p-5">
            <h3 className="text-sm font-semibold text-ink dark:text-white">{t('Need help?')}</h3>
            {can('cancel') && <Button variant="outline" className="w-full" onClick={() => setModal('cancel')}><X className="h-4 w-4" />{t('Cancel job')}</Button>}
            {can('open_dispute') && <Button variant="outline" className="w-full" onClick={() => setModal('dispute')}><Scale className="h-4 w-4" />{t('Report a problem / dispute')}</Button>}
            {j.disputes.map((d: any) => <div key={d.id} className="rounded-lg bg-surface-sunk p-2.5 text-xs dark:bg-white/5"><StatusBadge status={d.status} /> {d.reason}{d.resolution && <div className="mt-1 text-ink-soft">{t('Resolution')}: {d.resolution}</div>}</div>)}
          </Card>
        </aside>
      </div>

      <ChangeModal open={modal === 'change'} onClose={() => setModal(null)} job={j} onSubmit={async (b) => { await act.run(`/jobs/${id}/changes`, b); setModal(null); }} />
      <ReasonModal open={modal === 'cancel'} onClose={() => setModal(null)} title={t('Cancel job')} warning={t('Cancelling affects your reliability on UNRET. The other party will be notified.')} label={t('Reason for cancelling')} danger
        onSubmit={async (reason) => { await act.run(`/jobs/${id}/cancel`, { reason }); setModal(null); }} />
      <DisputeModal open={modal === 'dispute'} onClose={() => setModal(null)} onSubmit={async (b) => { await act.run(`/jobs/${id}/disputes`, b); setModal(null); }} />
      <ReviewModal open={modal === 'review'} onClose={() => setModal(null)} onSubmit={async (b) => { await api('/reviews', { body: { ...b, jobId: id } }); setModal(null); reload(); }} />
      <PaymentModal open={modal === 'payment'} onClose={() => setModal(null)} job={j} onDone={() => { setModal(null); reload(); }} />
    </Container>
  );
}

function eventLabel(e: any, t: (s: string) => string) {
  const map: Record<string, string> = {
    CREATED: 'Job created from accepted offer', CONFIRMED: 'Completion confirmed', CHANGE_PROPOSED: 'Change proposed', CHANGE_ACCEPTED: 'Change accepted',
    CHANGE_REJECTED: 'Change declined', CANCELLED_BY_CUSTOMER: 'Cancelled by customer', CANCELLED_BY_PROFESSIONAL: 'Cancelled by professional',
    DISPUTE_OPENED: 'Dispute opened', DISPUTE_RESOLVED: 'Dispute resolved', AUTO_COMPLETED: 'Completed automatically', ASSIGNED: 'Assigned to team member',
    PAYMENT_RECORDED: 'Payment recorded', PAYMENT_SUCCEEDED: 'Online payment received',
  };
  if (e.type === 'STATUS_CHANGE') return `${t('Status')}: ${t({ ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed' }[e.toStatus as string] ?? e.toStatus)}`;
  return t(map[e.type] ?? e.type);
}

function ChangeModal({ open, onClose, job, onSubmit }: { open: boolean; onClose: () => void; job: any; onSubmit: (b: any) => Promise<void> }) {
  const { t } = useT();
  const [f, setF] = useState({ price: '', scope: '', start: toLocalInput(job.scheduledStartAt), end: toLocalInput(job.scheduledEndAt), reason: '' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const startChanged = f.start && f.start !== toLocalInput(job.scheduledStartAt);
    await onSubmit({
      priceMinor: f.price ? majorToMinor(f.price) : undefined, scope: f.scope || undefined,
      scheduledStartAt: startChanged || (f.end && f.end !== toLocalInput(job.scheduledEndAt)) ? fromLocalInput(f.start) : undefined,
      scheduledEndAt: startChanged || (f.end && f.end !== toLocalInput(job.scheduledEndAt)) ? fromLocalInput(f.end) : undefined,
      reason: f.reason,
    });
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={t('Propose a change')}>
      <div className="space-y-4">
        <Alert tone="blue">{t('Changes only take effect when the other party accepts them. The original agreement is kept in the history.')}</Alert>
        <Field label={t('New price ({cur})', { cur: job.currency })} hint={t('Leave empty to keep the current price.')}><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Appointment start')}><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label={t('Appointment end')}><Input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </div>
        <Field label={t('New scope')} hint={t('Optional. Describe the full updated scope.')}><Textarea value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} /></Field>
        <Field label={t('Reason')} required><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t('e.g. Extra socket requested on site')} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button loading={busy} disabled={f.reason.length < 5} onClick={submit}>{t('Send proposal')}</Button></div>
      </div>
    </Modal>
  );
}

function ReasonModal({ open, onClose, title, label, warning, danger, onSubmit }: { open: boolean; onClose: () => void; title: string; label: string; warning?: string; danger?: boolean; onSubmit: (r: string) => Promise<void> }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {warning && <Alert tone="amber">{warning}</Alert>}
        <Field label={label} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('Back')}</Button><Button variant={danger ? 'danger' : 'primary'} disabled={reason.trim().length < 5} onClick={() => onSubmit(reason)}>{t('Confirm')}</Button></div>
      </div>
    </Modal>
  );
}

function DisputeModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (b: { reason: string; details: string }) => Promise<void> }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const reasons = [t('Work not completed'), t('Poor quality of work'), t('Price different from agreement'), t('No-show or repeated delays'), t('Payment issue'), t('Other')];
  return (
    <Modal open={open} onClose={onClose} title={t('Open a dispute')}>
      <div className="space-y-4">
        <Alert tone="amber"><span className="inline-flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" />{t('Try to resolve the issue by message first. A dispute pauses the job until our team reviews it.')}</span></Alert>
        <Field label={t('What is the problem?')} required><Select value={reason} onChange={(e) => setReason(e.target.value)}><option value="">{t('Choose')}</option>{reasons.map((r) => <option key={r}>{r}</option>)}</Select></Field>
        <Field label={t('Details')}><Textarea value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('Back')}</Button><Button variant="danger" disabled={!reason} onClick={() => onSubmit({ reason, details })}>{t('Open dispute')}</Button></div>
      </div>
    </Modal>
  );
}

function ReviewModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const { t } = useT();
  const [f, setF] = useState({ overall: 0, communication: 0, quality: 0, punctuality: 0, text: '' });
  const [err, setErr] = useState<string | null>(null);
  const ok = f.overall && f.communication && f.quality && f.punctuality;
  return (
    <Modal open={open} onClose={onClose} title={t('Review this job')}>
      <div className="space-y-4">
        <StarInput label={t('Overall')} value={f.overall} onChange={(v) => setF({ ...f, overall: v })} />
        <StarInput label={t('Communication')} value={f.communication} onChange={(v) => setF({ ...f, communication: v })} />
        <StarInput label={t('Quality of work')} value={f.quality} onChange={(v) => setF({ ...f, quality: v })} />
        <StarInput label={t('Punctuality')} value={f.punctuality} onChange={(v) => setF({ ...f, punctuality: v })} />
        <Field label={t('Your feedback')} hint={t('Optional. Be honest and specific — it helps others.')}><Textarea value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} maxLength={3000} /></Field>
        {err && <Alert>{err}</Alert>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button disabled={!ok} onClick={() => onSubmit({ ...f, text: f.text || undefined }).catch((e) => setErr(e.message))}>{t('Publish review')}</Button></div>
      </div>
    </Modal>
  );
}

function PaymentModal({ open, onClose, job, onDone }: { open: boolean; onClose: () => void; job: any; onDone: () => void }) {
  const { t, intl } = useT();
  const [tab, setTab] = useState<'online' | 'direct'>(job.viewerRole === 'customer' && job.allowedActions.includes('pay_online') ? 'online' : 'direct');
  const [amount, setAmount] = useState(String(job.agreedPriceMinor / 100));
  const [method, setMethod] = useState('bank_transfer');
  const [checkout, setCheckout] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} onClose={onClose} title={t('Payment')}>
      <div className="space-y-4">
        {job.viewerRole === 'customer' && (
          <div className="flex gap-1 rounded-xl bg-surface-sunk p-1 dark:bg-white/5">
            {(['online', 'direct'] as const).map((k) => <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-white shadow-sm dark:bg-white/15' : 'text-ink-muted'}`}>{k === 'online' ? t('Pay online') : t('Record direct payment')}</button>)}
          </div>
        )}
        {tab === 'online' ? (
          !checkout ? (
            <>
              <p className="text-sm text-ink-soft dark:text-white/70">{t('You will pay {amount} securely through our payment provider. UNRET never sees or stores your card details.', { amount: money(job.agreedPriceMinor, job.currency, intl) })}</p>
              <Button className="w-full" loading={busy} onClick={() => run(async () => setCheckout(await api(`/payments/jobs/${job.id}/checkout`, { method: 'POST' })))}>{t('Continue to payment')}</Button>
            </>
          ) : checkout.provider === 'mock' ? (
            <>
              <Alert tone="amber">{t('Development mode: no real payment provider is configured. Simulate the result below.')}</Alert>
              <div className="flex gap-2">
                <Button className="flex-1" loading={busy} onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'succeed' } }); onDone(); })}>{t('Simulate successful payment')}</Button>
                <Button variant="outline" loading={busy} onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'fail' } }); onDone(); })}>{t('Simulate failure')}</Button>
              </div>
            </>
          ) : <p className="text-sm">{t('Redirecting to payment…')}</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{t('Record a payment made outside UNRET. This is for your records only — UNRET does not process or guarantee direct payments.')}</p>
            <Field label={t('Amount ({cur})', { cur: job.currency })}><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label={t('Method')}>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">{t('Cash')}</option><option value="bank_transfer">{t('Bank transfer')}</option><option value="card_terminal">{t('Card (terminal)')}</option><option value="other">{t('Other')}</option>
              </Select>
            </Field>
            <Button className="w-full" loading={busy} onClick={() => run(async () => { await api(`/payments/jobs/${job.id}/direct`, { body: { amountMinor: majorToMinor(amount), method } }); onDone(); })}>{t('Record payment')}</Button>
          </>
        )}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  );
}

function AssignCard({ job, onDone }: { job: any; onDone: (j: any) => void }) {
  const { t } = useT();
  const [uid, setUid] = useState(job.assignedMemberUserId ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="space-y-3 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white"><CalendarDays className="h-4 w-4" />{t('Team assignment')}</h3>
      <Select value={uid} onChange={(e) => setUid(e.target.value)}>
        <option value="">{t('Not assigned')}</option>
        {job.company.members.map((m: any) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
      </Select>
      <Button size="sm" variant="outline" disabled={!uid || uid === job.assignedMemberUserId} onClick={async () => { try { onDone(await api(`/jobs/${job.id}/assign`, { body: { userId: uid } })); } catch (e) { setErr((e as Error).message); } }}>{t('Assign')}</Button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </Card>
  );
}
