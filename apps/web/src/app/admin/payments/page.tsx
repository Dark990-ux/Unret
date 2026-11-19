'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, PageHeader, PageLoader, Select, StatusBadge } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime, majorToMinor, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Payments /></AdminShell>;
}

function Payments() {
  const { t, intl } = useT();
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi<{ items: any[] }>('/payments/admin', { status, pageSize: 100 });
  const refund = async (p: any) => {
    const amount = prompt(t('Refund amount ({cur})', { cur: p.currency }), String((p.grossMinor - p.refundedMinor) / 100));
    if (!amount) return;
    const reason = prompt(t('Reason')) ?? '';
    try { await api(`/payments/${p.id}/refund`, { body: { amountMinor: majorToMinor(amount), reason } }); reload(); } catch (e) { alert((e as Error).message); }
  };
  return (
    <>
      <PageHeader title={t('Payments')} actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}><option value="">{t('All statuses')}</option>{['RECORDED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => <option key={s}>{s}</option>)}</Select>} />
      {loading ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-ink-muted"><tr className="border-b border-surface-line dark:border-white/10">{[t('Date'), t('Job'), t('Method'), t('Gross'), t('Platform fee'), t('Provider fee'), t('Payout'), t('Refunded'), t('Reference'), t('Status'), ''].map((h, i) => <th key={i} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {data?.items.map((p) => (
                <tr key={p.id} className="border-b border-surface-line last:border-0 dark:border-white/10">
                  <td className="p-3 whitespace-nowrap">{dateTime(p.createdAt, intl)}</td>
                  <td className="p-3"><Link href={`/jobs/${p.job.id}`} className="text-brand-700">{p.job.request.title}</Link><div className="text-xs text-ink-muted">{p.job.customer.name}</div></td>
                  <td className="p-3">{p.method}{p.provider && ` · ${p.provider}`}</td>
                  {[p.grossMinor, p.platformFeeMinor, p.providerFeeMinor, p.payoutMinor, p.refundedMinor].map((v, i) => <td key={i} className="p-3 text-right tabular-nums">{money(v, p.currency, intl)}</td>)}
                  <td className="max-w-[140px] truncate p-3 font-mono text-xs">{p.providerReference ?? '—'}</td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                  <td className="p-3">{p.method === 'PLATFORM' && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status) && <Button size="sm" variant="outline" onClick={() => refund(p)}>{t('Refund')}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
