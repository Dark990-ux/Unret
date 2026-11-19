'use client';

import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { Card, Empty, PageLoader, StatusBadge } from './ui';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export function PaymentsTable({ as }: { as: 'customer' | 'professional' }) {
  const { t, intl } = useT();
  const { data, loading } = useApi<{ items: any[]; totals: any[] }>('/payments', { as, pageSize: 100 });
  if (loading) return <PageLoader />;
  if (!data?.items.length) return <Empty icon={<Wallet className="h-8 w-8" />} title={t('No payments yet')} />;
  return (
    <>
      {as === 'professional' && data.totals.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {data.totals.map((x: any) => (
            <Card key={x.currency + x.method} className="p-4">
              <div className="text-sm text-ink-muted">{x.method === 'PLATFORM' ? t('Online payouts') : t('Direct payments recorded')}</div>
              <div className="text-2xl font-semibold tabular-nums">{money(x._sum.payoutMinor, x.currency, intl)}</div>
              {x.method === 'PLATFORM' && <div className="text-xs text-ink-muted">{t('Platform fees')}: {money(x._sum.platformFeeMinor, x.currency, intl)}</div>}
            </Card>
          ))}
        </div>
      )}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="text-left text-ink-muted"><tr className="border-b border-surface-line dark:border-white/10">
            <th className="p-3 font-medium">{t('Date')}</th><th className="p-3 font-medium">{t('Job')}</th><th className="p-3 font-medium">{t('Method')}</th>
            <th className="p-3 text-right font-medium">{t('Amount')}</th>{as === 'professional' && <th className="p-3 text-right font-medium">{t('Payout')}</th>}<th className="p-3 font-medium">{t('Status')}</th>
          </tr></thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="border-b border-surface-line last:border-0 dark:border-white/10">
                <td className="p-3 whitespace-nowrap">{dateTime(p.createdAt, intl)}</td>
                <td className="p-3"><Link href={`/jobs/${p.job.id}`} className="text-brand-700 hover:underline">{p.job.request.title}</Link></td>
                <td className="p-3">{p.method === 'PLATFORM' ? t('Online') : t('Direct')}</td>
                <td className="p-3 text-right tabular-nums">{money(p.grossMinor, p.currency, intl)}</td>
                {as === 'professional' && <td className="p-3 text-right tabular-nums">{money(p.payoutMinor, p.currency, intl)}</td>}
                <td className="p-3"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

