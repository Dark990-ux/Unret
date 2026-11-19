'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, KeyValue, Modal, PageHeader, PageLoader, StatusBadge, Textarea } from '@/components/ui-exports';
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
  const { data: u, loading, reload } = useApi<any>(`/admin/users/${id}`);
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (loading || !u) return <PageLoader />;
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
