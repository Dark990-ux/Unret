'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, KeyValue, Modal, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { useAuth } from '@/lib/auth';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><UserDetail /></AdminShell>;
}

function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const { data: u, reload } = useApi<any>(`/admin/users/${id}`);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Keep the page on screen while it refreshes, so confirmations (e.g. "reset link sent") stay visible.
  if (!u) return <PageLoader />;
  const run = (fn: () => Promise<unknown>) => fn().then(reload).catch((e) => setErr(e.message));
  return (
    <>
      <PageHeader title={u.name} back={{ href: '/admin/users', label: t('Users') }} subtitle={<span className="flex items-center gap-2"><StatusBadge status={u.status} />{u.suspendedReason && <span>{u.suspendedReason}</span>}</span>}
        actions={u.role !== 'ADMIN' && (u.status === 'ACTIVE' ? <Button variant="danger" onClick={() => setSuspending(true)}>{t('Suspend account')}</Button> : u.status === 'SUSPENDED' ? <Button onClick={() => run(() => api(`/admin/users/${id}/reactivate`, { method: 'POST' }))}>{t('Reactivate')}</Button> : null)} />
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('Account')}</h2>
          <KeyValue items={[[t('Email'), u.email ?? '—'], [t('Phone'), u.phone ?? '—'], [t('Country'), u.countryCode], [t('Language'), u.preferredLanguage], [t('Joined'), dateTime(u.createdAt, intl)], [t('Last login'), dateTime(u.lastLoginAt, intl)], [t('Role'), u.role], ['MFA', u.mfaEnabled ? t('Enabled') : t('Disabled')]]} />
        </Card>
        {u.professional && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t('Professional profile')}</h2><Link href={`/pros/${u.professional.id}`} className="text-sm text-brand-700">{t('View')}</Link></div>
            <KeyValue items={[[t('Business'), u.professional.businessName ?? '—'], [t('Visibility'), <StatusBadge key="v" status={u.professional.visibility} />], [t('Rating'), `${u.professional.ratingAvg} (${u.professional.ratingCount})`], [t('Completed / cancelled'), `${u.professional.completedJobs} / ${u.professional.cancelledJobs}`], [t('Reliability'), u.professional.reliabilityScore], [t('Services'), u.professional.services.map((s: any) => s.category.slug).join(', ')]]} />
            <div className="mt-3 flex flex-wrap gap-1">{u.professional.verifications.map((v: any) => <Badge key={v.id} tone={v.status === 'APPROVED' ? 'green' : v.status === 'REJECTED' ? 'red' : 'amber'}>{v.type} · {v.status}</Badge>)}</div>
          </Card>
        )}
        <HelpTools u={u} onDone={reload} />
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('Recent requests and jobs')}</h2>
          <ul className="space-y-1.5 text-sm">
            {u.requests.map((r: any) => <li key={r.id} className="flex justify-between gap-2"><Link href={`/requests/${r.id}`} className="truncate text-brand-700">{r.title}</Link><StatusBadge status={r.status} /></li>)}
            {u.customerJobs.map((j: any) => <li key={j.id} className="flex justify-between gap-2"><Link href={`/jobs/${j.id}`} className="text-brand-700">{t('Job')} · {money(j.agreedPriceMinor, j.currency, intl)}</Link><StatusBadge status={j.status} /></li>)}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('Reports against this user')} ({u.reportsAgainst.length})</h2>
          <ul className="space-y-1.5 text-sm">{u.reportsAgainst.map((r: any) => <li key={r.id}><StatusBadge status={r.status} /> {r.reason}{r.details && ` — ${r.details}`}</li>)}</ul>
        </Card>
        <Card className="p-5 xl:col-span-2">
          <h2 className="mb-3 font-semibold">{t('Audit trail')}</h2>
          <ul className="space-y-1 font-mono text-xs">{u.auditTrail.map((a: any) => <li key={a.id}>{dateTime(a.createdAt, intl)} · {a.action} · {a.entityType}</li>)}</ul>
        </Card>
      </div>
      <Modal open={suspending} onClose={() => setSuspending(false)} title={t('Suspend account')}>
        <div className="space-y-4">
          <Alert tone="amber">{t('The user is signed out immediately and their professional profile is hidden. This action is logged.')}</Alert>
          <Field label={t('Reason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSuspending(false)}>{t('Cancel')}</Button><Button variant="danger" disabled={reason.length < 5} onClick={() => { setSuspending(false); run(() => api(`/admin/users/${id}/suspend`, { body: { reason } })); }}>{t('Suspend')}</Button></div>
        </div>
      </Modal>
    </>
  );
}

/** Fixing a person's problem without asking engineers: sign-in help, messages, plan changes, reading a case's conversations. */
function HelpTools({ u, onDone }: { u: any; onDone: () => void }) {
  const { t, intl } = useT();
  const { me } = useAuth();
  const perms: string[] = (me as any)?.adminPermissions ?? [];
  const can = (p: string) => perms.includes(p);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [notify, setNotify] = useState<{ title: string; body: string } | null>(null);
  const [plan, setPlan] = useState({ code: 'standard', days: '30' });
  const [convs, setConvs] = useState<any[] | null>(null);
  const [reading, setReading] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const run = (fn: () => Promise<any>, ok: string) => { setMsg(null); return fn().then(() => { setMsg({ tone: 'green', text: ok }); onDone(); }).catch((e) => setMsg({ tone: 'red', text: e.message })); };
  if (!can('users.manage') && !can('payments.manage') && !can('conversations.read')) return null;
  return (
    <Card className="space-y-4 p-5 xl:col-span-2" data-testid="help-tools">
      <h2 className="font-semibold">{t('Help this person')}</h2>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {can('users.manage') && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!u.email} onClick={() => run(() => api(`/admin/users/${u.id}/password-reset`, { method: 'POST' }), t('Password reset link sent to {email} (valid 24 hours).', { email: u.email }))}>🔑 {t('Send password reset link')}</Button>
          {u.mfaEnabled && <Button size="sm" variant="outline" onClick={() => { if (confirm(t('Turn off two-factor login for this person? Do this only after confirming who they are.'))) run(() => api(`/admin/users/${u.id}/reset-mfa`, { method: 'POST' }), t('Two-factor login turned off.')); }}>🛡️ {t('Turn off two-factor login')}</Button>}
          <Button size="sm" variant="outline" onClick={() => setNotify({ title: '', body: '' })}>✉️ {t('Send a message')}</Button>
        </div>
      )}
      {notify && (
        <div className="space-y-2 rounded-xl border border-surface-line p-3 dark:border-white/15">
          <Field label={t('Title')}><Input value={notify.title} onChange={(e) => setNotify({ ...notify, title: e.target.value })} /></Field>
          <Field label={t('Message')}><Textarea value={notify.body} onChange={(e) => setNotify({ ...notify, body: e.target.value })} /></Field>
          <div className="flex gap-2"><Button size="sm" disabled={notify.title.length < 3 || notify.body.length < 3} onClick={() => run(() => api(`/admin/users/${u.id}/notify`, { body: notify }), t('Message sent (in the app, by push and email).')).then(() => setNotify(null))}>{t('Send')}</Button><Button size="sm" variant="ghost" onClick={() => setNotify(null)}>{t('Cancel')}</Button></div>
        </div>
      )}
      {can('payments.manage') && u.professional && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40"><Field label={t('Give a plan')}><Select value={plan.code} onChange={(e) => setPlan({ ...plan, code: e.target.value })}><option value="standard">Standard</option><option value="deluxe">Deluxe</option><option value="vip">VIP</option><option value="free">{t('Free (end paid plan now)')}</option></Select></Field></div>
          {plan.code !== 'free' && <div className="w-28"><Field label={t('Days')}><Input type="number" min={1} max={365} value={plan.days} onChange={(e) => setPlan({ ...plan, days: e.target.value })} /></Field></div>}
          <Button size="sm" variant="outline" onClick={() => run(() => api(`/admin/users/${u.id}/plan`, { body: { planCode: plan.code, days: Number(plan.days) || 30 } }), plan.code === 'free' ? t('Paid plan ended.') : t('Plan given for free; it ends by itself.'))}>{t('Apply')}</Button>
        </div>
      )}
      {can('conversations.read') && (
        <div>
          {!convs ? <Button size="sm" variant="ghost" onClick={() => api<any[]>(`/admin/users/${u.id}/conversations`).then(setConvs).catch((e) => setMsg({ tone: 'red', text: e.message }))}>💬 {t('Conversations (for a case)')}</Button> : (
            <div className="space-y-2">
              <p className="text-xs text-ink-muted">{t('Conversations are private. Open one only when it is needed for a case; every read is recorded with your reason.')}</p>
              <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">{convs.map((c) => <li key={c.id} className="flex items-center justify-between gap-2 py-1.5"><span className="truncate">{c.customer} ↔ {c.professional}{c.request ? ` · ${c.request}` : ''} <span className="text-ink-muted">({c.messages})</span></span><Button size="sm" variant="ghost" onClick={() => setReading({ id: c.id })}>{t('Read')}</Button></li>)}</ul>
            </div>
          )}
          <Modal open={!!reading} onClose={() => { setReading(null); setReason(''); }} title={t('Read conversation')} wide>
            {reading && !reading.messages ? (
              <div className="space-y-3">
                <Field label={t('Why do you need to read it?')} required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. Ticket #1001, dispute about payment')} /></Field>
                <Button disabled={reason.trim().length < 3} onClick={() => api(`/admin/conversations/${reading.id}`, { query: { reason } }).then(setReading).catch((e) => setMsg({ tone: 'red', text: e.message }))}>{t('Open')}</Button>
              </div>
            ) : reading && (
              <ul className="max-h-[60vh] space-y-2 overflow-y-auto text-sm">{reading.messages.map((m: any) => <li key={m.id}><span className="text-xs text-ink-muted">{dateTime(m.createdAt, intl)} · {m.sender?.name ?? 'UNRET'}</span><p className="whitespace-pre-wrap">{m.body}</p></li>)}</ul>
            )}
          </Modal>
        </div>
      )}
    </Card>
  );
}
