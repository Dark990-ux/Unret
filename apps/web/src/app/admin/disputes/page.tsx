'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Alert, Button, Card, Empty, Field, Modal, PageHeader, PageLoader, Select, StatusBadge, Tabs, Textarea } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Disputes /></AdminShell>;
}

function Disputes() {
  const { t, intl } = useT();
  const [status, setStatus] = useState<'' | 'RESOLVED'>('');
  const { data, loading, reload } = useApi<{ items: any[] }>('/admin/disputes', { status, pageSize: 50 });
  const [resolving, setResolving] = useState<any | null>(null);
  const [outcome, setOutcome] = useState('COMPLETED');
  const [resolution, setResolution] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <PageHeader title={t('Disputes')} />
      <Tabs value={status} onChange={setStatus} items={[{ value: '', label: t('Open') }, { value: 'RESOLVED', label: t('Resolved') }]} />
      {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<Scale className="h-8 w-8" />} title={t('No disputes')} /> : (
        <div className="space-y-3">
          {data.items.map((d) => (
            <Card key={d.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.status} /><b>{d.reason}</b><span className="text-ink-muted">{t('opened by {name}', { name: d.openedBy.name })} · {dateTime(d.createdAt, intl)}</span></div>
              <div><Link href={`/jobs/${d.job.id}`} className="text-brand-700">{d.job.request.title}</Link> · {d.job.customer.name} ↔ {d.job.professional.businessName ?? d.job.professional.user.name} · {money(d.job.agreedPriceMinor, d.job.currency, intl)}</div>
              {d.details && <p className="text-ink-soft">{d.details}</p>}
              {d.resolution && <p className="text-ink-soft">{t('Resolution')}: {d.resolution} ({d.resolvedBy?.name})</p>}
              {d.status !== 'RESOLVED' && (
                <div className="flex gap-2 pt-1">
                  {d.status === 'OPEN' && <Button size="sm" variant="outline" onClick={async () => { await api(`/admin/disputes/${d.id}/review`, { method: 'POST' }); reload(); }}>{t('Mark under review')}</Button>}
                  <Button size="sm" onClick={() => { setResolving(d); setResolution(''); setErr(null); }}>{t('Resolve')}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!resolving} onClose={() => setResolving(null)} title={t('Resolve dispute')}>
        <div className="space-y-4">
          <Field label={t('Outcome for the job')}>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="COMPLETED">{t('Mark job as completed')}</option><option value="CANCELLED">{t('Cancel the job')}</option><option value="IN_PROGRESS">{t('Resume work (back to in progress)')}</option>
            </Select>
          </Field>
          <Field label={t('Resolution (sent to both parties)')} required><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setResolving(null)}>{t('Cancel')}</Button><Button disabled={resolution.length < 5} onClick={async () => { try { await api(`/admin/disputes/${resolving.id}/resolve`, { body: { outcome, resolution } }); setResolving(null); reload(); } catch (e) { setErr((e as Error).message); } }}>{t('Resolve')}</Button></div>
        </div>
      </Modal>
    </>
  );
}
