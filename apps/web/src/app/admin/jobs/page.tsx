'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Empty, Field, Input, Modal, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Suspense><Jobs /></Suspense></AdminShell>;
}

/** Find any job and step in when it is stuck: cancel it (held money is refunded) or mark it completed (held money is paid out). */
function Jobs() {
  const { t, intl } = useT();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi<any>('/admin/jobs', { q: q || undefined, status: status || undefined, pageSize: 50 });
  const [act, setAct] = useState<{ job: any; to: 'cancel' | 'complete' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async () => {
    if (!act) return;
    setBusy(true); setErr(null);
    try { await api(`/admin/jobs/${act.job.id}/${act.to}`, { body: { note } }); setOk(act.to === 'cancel' ? t('Job cancelled. Both people were notified.') : t('Job marked as completed. Both people were notified.')); setAct(null); setNote(''); reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={t('Jobs')} subtitle={t('Find a job by title, person or ID, and step in when it is stuck.')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search: title, customer, professional, ID')} className="max-w-sm" aria-label={t('Search')} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[200px]" aria-label={t('Status')}>
          <option value="">{t('Any status')}</option>{['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'DISPUTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      {ok && <div className="mb-4"><Alert tone="green">{ok}</Alert></div>}
      {loading || !data ? <PageLoader /> : !data.items.length ? <Empty title={t('No jobs found')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm" data-testid="jobs-table">
            <thead><tr className="border-b border-surface-line text-left text-ink-muted dark:border-white/10">{['Job', 'Customer', 'Professional', 'Price', 'Status', 'Created', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{t(h)}</th>)}</tr></thead>
            <tbody>
              {data.items.map((j: any) => {
                const open = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'DISPUTED'].includes(j.status);
                return (
                  <tr key={j.id} className="border-b border-surface-line last:border-0 dark:border-white/10">
                    <td className="max-w-[240px] truncate px-4 py-2.5"><Link href={`/jobs/${j.id}`} className="text-brand-700 hover:underline">{j.title}</Link></td>
                    <td className="px-4 py-2.5"><Link href={`/admin/users/${j.customer.id}`} className="hover:underline">{j.customer.name}</Link></td>
                    <td className="px-4 py-2.5"><Link href={`/admin/users/${j.professional.id}`} className="hover:underline">{j.professional.name}</Link></td>
                    <td className="px-4 py-2.5 tabular-nums">{money(j.priceMinor, j.currency, intl)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-2.5 text-ink-muted">{dateTime(j.createdAt, intl)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{open && <><Button size="sm" variant="outline" onClick={() => { setErr(null); setAct({ job: j, to: 'complete' }); }}>{t('Complete')}</Button> <Button size="sm" variant="danger" onClick={() => { setErr(null); setAct({ job: j, to: 'cancel' }); }}>{t('Cancel')}</Button></>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!act} onClose={() => setAct(null)} title={act?.to === 'cancel' ? t('Cancel this job?') : t('Mark this job as completed?')}>
        {act && (
          <div className="space-y-4">
            <p className="text-sm"><b>{act.job.title}</b> · {act.job.customer.name} ↔ {act.job.professional.name}</p>
            <Alert tone="amber">{act.to === 'cancel' ? t('Money still held by UNRET is refunded to the customer. Both people receive your explanation.') : t('Money still held by UNRET is sent to the professional. The customer can then leave a review.')}</Alert>
            <Field label={t('Explanation for both people')} required><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={act.to === 'cancel' ? t('e.g. The professional could not be reached for 5 days.') : t('e.g. Both confirmed by phone that the work is done.')} /></Field>
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAct(null)}>{t('Back')}</Button><Button variant={act.to === 'cancel' ? 'danger' : 'primary'} loading={busy} disabled={note.trim().length < 5} onClick={run}>{act.to === 'cancel' ? t('Cancel job') : t('Mark completed')}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
