'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Alert, Button, Card, Checkbox, KeyValue, Modal, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { AttachmentPicker, SUPPORT_CATEGORIES, TicketThread, ticketRef } from '@/components/support';
import { api, download } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <AdminShell><StaffTicket /></AdminShell>;
}

/** How each history line reads. */
const EVENT_LABELS: Record<string, string> = {
  created: 'Ticket created', reply: 'Replied to the person', note: 'Internal note', person_reply: 'The person wrote', status: 'Status changed',
  priority: 'Priority changed', assigned: 'Assigned', reopened: 'Opened again', solved_by_person: 'The person marked it solved', resolution: 'Resolution updated', auto_closed: 'Closed automatically',
};
const STATUS_LABELS: Record<string, string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_USER: 'Waiting for the person', RESOLVED: 'Resolved', CLOSED: 'Closed' };

const REPLIES = [
  'Thank you for writing to us. We are looking into it and will come back to you shortly.',
  'Could you send us a screenshot and the name of the job, so we can check the details?',
  'We fixed it on our side. Please check again and tell us if everything looks right now.',
];

function StaffTicket() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const { data: tk, loading, setData, reload } = useApi<any>(`/admin/support/tickets/${id}`);
  const team = useApi<any[]>('/admin/team');
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<{ key: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState<null | { status: string; text: string }>(null);
  useRealtime<any>('support', (e) => e.ticketId === id && reload());
  if (loading || !tk) return <PageLoader />;
  const patch = async (b: any) => { setErr(null); try { setData(await api(`/admin/support/tickets/${id}`, { method: 'PATCH', body: b })); return true; } catch (x) { setErr((x as Error).message); return false; } };
  // Solving or closing needs a short note on how it was solved, so the record is complete.
  const changeStatus = (status: string) => {
    if ((status === 'RESOLVED' || status === 'CLOSED') && !tk.resolutionSummary) setResolving({ status, text: '' });
    else patch({ status });
  };
  const saveRecord = () => download(`/admin/support/tickets/${id}/record`, `unret-ticket-${tk.number}.txt`).catch((x) => setErr((x as Error).message));
  const name = (e: any) => e.actor?.name ?? t('System');
  const val = (v: string | null) => (v ? (STATUS_LABELS[v] ? t(STATUS_LABELS[v]) : (team.data ?? []).find((m) => m.id === v)?.name ?? t(v[0] + v.slice(1).toLowerCase())) : t('Nobody'));
  const send = async () => {
    setBusy(true); setErr(null);
    try { setData(await api(`/admin/support/tickets/${id}/messages`, { body: { body, internal, attachmentKeys: files.map((x) => x.key) } })); setBody(''); setFiles([]); setInternal(false); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const cat = SUPPORT_CATEGORIES.find(([v]) => v === tk.category);
  const u = tk.user;
  return (
    <>
      <PageHeader title={tk.subject} back={{ href: '/admin/support', label: t('Support tickets') }}
        actions={<div className="flex flex-wrap gap-2">{!['RESOLVED', 'CLOSED'].includes(tk.status) && <Button onClick={() => changeStatus('RESOLVED')}>✓ {t('Mark as solved')}</Button>}<Button variant="outline" onClick={saveRecord}><Download className="h-4 w-4" />{t('Download record')}</Button></div>} subtitle={<span className="flex flex-wrap items-center gap-2">{ticketRef(tk.number)} · {cat ? `${cat[1]} ${t(cat[2])}` : tk.category} · {t(tk.kind === 'problem' ? 'Problem report' : tk.kind === 'contact' ? 'Contact' : 'Question')} · {dateTime(tk.createdAt, intl)}</span>} />
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="space-y-5 p-5">
          <TicketThread t={tk} staffView />
          <div className="space-y-2 border-t border-surface-line pt-4 dark:border-white/10">
            <div className="flex flex-wrap gap-1.5">{REPLIES.map((r) => <button key={r} type="button" onClick={() => setBody(t(r))} className="rounded-full border border-surface-line px-2.5 py-1 text-xs text-ink-muted hover:border-brand-400 dark:border-white/15">{t(r).slice(0, 38)}…</button>)}</div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? t('Note for the team (the person does not see it)…') : t('Reply to {name}…', { name: u?.name ?? tk.name ?? '' })} aria-label={t('Reply')} className={internal ? 'min-h-[100px] border-amber-400 bg-amber-50/60 dark:bg-amber-500/10' : 'min-h-[100px]'} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4"><Checkbox label={`🔒 ${t('Internal note')}`} checked={internal} onChange={(e) => setInternal(e.target.checked)} />{!tk.userId && <span className="text-xs text-ink-muted">{t('No account: the reply is sent by email to {email}', { email: tk.email })}</span>}</div>
              <div className="flex items-center gap-2"><AttachmentPicker keys={files} onChange={setFiles} /><Button loading={busy} disabled={!body.trim()} onClick={send}>{internal ? t('Save note') : t('Send reply')}</Button></div>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-semibold text-ink dark:text-white">{t('Ticket')}</h2>
            <label className="block text-sm"><span className="mb-1 block text-ink-muted">{t('Status')}</span>
              <Select value={tk.status} onChange={(e) => changeStatus(e.target.value)} aria-label={t('Status')}>{Object.keys(STATUS_LABELS).map((s) => <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>)}</Select></label>
            <label className="block text-sm"><span className="mb-1 block text-ink-muted">{t('Priority')}</span>
              <Select value={tk.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label={t('Priority')}>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => <option key={s} value={s}>{t(s[0] + s.slice(1).toLowerCase())}</option>)}</Select></label>
            <label className="block text-sm"><span className="mb-1 block text-ink-muted">{t('Assigned to')}</span>
              <Select value={tk.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })} aria-label={t('Assigned to')}>
                <option value="">{t('Nobody')}</option>{(team.data ?? []).filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select></label>
            {!tk.assigneeId && <Button size="sm" variant="outline" className="w-full" onClick={() => patch({ assigneeId: 'me' })}>{t('Assign to me')}</Button>}
          </Card>
          <Card className="space-y-2 p-5 text-sm" data-testid="resolution">
            <div className="flex items-center justify-between"><h2 className="font-semibold text-ink dark:text-white">{t('How it was solved')}</h2>
              {tk.resolutionSummary && <button className="text-xs text-brand-700" onClick={() => setResolving({ status: '', text: tk.resolutionSummary })}>{t('Edit')}</button>}</div>
            {tk.resolutionSummary ? (
              <>
                <p className="whitespace-pre-wrap text-ink-soft dark:text-white/80">{tk.resolutionSummary}</p>
                <p className="text-xs text-ink-muted">{tk.resolvedBy ? (tk.resolvedBy.role === 'ADMIN' ? tk.resolvedBy.name : t('Confirmed by the person')) : ''}{tk.resolvedAt ? ` · ${dateTime(tk.resolvedAt, intl)}` : ''}</p>
              </>
            ) : <p className="text-ink-muted">{t('Not solved yet. When you mark it solved, write a short note on what was done; it stays in the problem register.')}</p>}
            <KeyValue items={[[t('Received'), dateTime(tk.createdAt, intl)], [t('First reply'), tk.firstResponseAt ? dateTime(tk.firstResponseAt, intl) : '—'], [t('Closed'), tk.closedAt ? dateTime(tk.closedAt, intl) : '—'], [t('Opened again'), `${tk.reopenCount}×`]]} />
          </Card>
          <Card className="p-5 text-sm" data-testid="history">
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('History')}</h2>
            <ol className="relative space-y-3 border-l border-surface-line pl-4 dark:border-white/15">
              {(tk.events ?? []).map((e: any) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 dark:border-surface-dark" />
                  <div className="font-medium text-ink dark:text-white">{t(EVENT_LABELS[e.type] ?? e.type)}{(e.type === 'status' || e.type === 'priority' || e.type === 'reopened' || e.type === 'assigned' || e.type === 'auto_closed') && <span className="font-normal text-ink-muted">: {e.fromValue ? `${val(e.fromValue)} → ` : ''}{val(e.toValue)}</span>}</div>
                  {e.note && <div className="text-ink-soft dark:text-white/70">“{e.note}”</div>}
                  <div className="text-xs text-ink-muted">{name(e)} · {dateTime(e.createdAt, intl)}</div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="space-y-2 p-5">
            <h2 className="font-semibold text-ink dark:text-white">{t('Person')}</h2>
            {u ? (
              <>
                <KeyValue items={[[t('Name'), u.name], [t('Email'), u.email ?? '—'], [t('Phone'), u.phone ?? '—'], [t('Account'), <StatusBadge key="s" status={u.status} />], [t('Member since'), dateTime(u.createdAt, intl)], [t('Tickets'), u._count.supportTickets], [t('Requests / jobs'), `${u._count.requests} / ${u._count.customerJobs}`]]} />
                <Button size="sm" variant="outline" className="w-full" href={`/admin/users/${u.id}`}>{t('Open user page')}</Button>
              </>
            ) : <KeyValue items={[[t('Name'), tk.name], [t('Email'), tk.email], [t('Account'), t('No account')]]} />}
          </Card>
          {(tk.related.job || tk.related.request || tk.related.payment || tk.pageUrl) && (
            <Card className="space-y-2 p-5 text-sm">
              <h2 className="font-semibold text-ink dark:text-white">{t('Linked to')}</h2>
              {tk.related.job && <div><Link href={`/jobs/${tk.related.job.id}`} className="text-brand-700 hover:underline">{t('Job')}: {tk.related.job.request.title}</Link> <StatusBadge status={tk.related.job.status} /> <span className="text-ink-muted">{money(tk.related.job.agreedPriceMinor, tk.related.job.currency, intl)}</span> · <Link href={`/admin/jobs?q=${tk.related.job.id}`} className="text-brand-700">{t('Fix this job')}</Link></div>}
              {tk.related.request && <div><Link href={`/requests/${tk.related.request.id}`} className="text-brand-700 hover:underline">{t('Request')}: {tk.related.request.title}</Link> <StatusBadge status={tk.related.request.status} /></div>}
              {tk.related.payment && <div>{t('Payment')}: {money(tk.related.payment.grossMinor, tk.related.payment.currency, intl)} <StatusBadge status={tk.related.payment.status} /></div>}
              {tk.pageUrl && <div className="text-ink-muted">{t('Page')}: {tk.pageUrl}</div>}
            </Card>
          )}
        </div>
      </div>
      <Modal open={!!resolving} onClose={() => setResolving(null)} title={resolving?.status === 'CLOSED' ? t('Close this ticket') : resolving?.status ? t('Mark as solved') : t('How it was solved')}>
        {resolving && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{t('Write in a few words what the problem was and what was done. It is saved permanently in the problem register{tell}.', { tell: resolving.status === 'RESOLVED' && tk.userId ? t(' and sent to the person') : '' })}</p>
            <Textarea autoFocus value={resolving.text} onChange={(e) => setResolving({ ...resolving, text: e.target.value })} className="min-h-[120px]" aria-label={t('How it was solved')} placeholder={t('e.g. The second charge was a card hold; the bank released it after 3 days.')} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResolving(null)}>{t('Cancel')}</Button>
              <Button disabled={resolving.text.trim().length < 5} onClick={async () => { if (await patch({ ...(resolving.status ? { status: resolving.status } : {}), resolution: resolving.text.trim() })) setResolving(null); }}>{t('Save')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
