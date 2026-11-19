'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Card, Empty, PageHeader, PageLoader, StatusBadge, Tabs } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { money, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Offers /></ProShell>;
}

function Offers() {
  const { t, intl } = useT();
  const [status, setStatus] = useState<'' | 'PENDING' | 'MODIFICATION_REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'>('');
  const { data, loading } = useApi<any[]>('/offers/mine', { status });
  return (
    <>
      <PageHeader title={t('My offers')} />
      <Tabs value={status} onChange={setStatus} items={[{ value: '', label: t('All') }, { value: 'PENDING', label: t('Pending') }, { value: 'MODIFICATION_REQUESTED', label: t('Changes requested') }, { value: 'ACCEPTED', label: t('Accepted') }, { value: 'REJECTED', label: t('Rejected') }, { value: 'EXPIRED', label: t('Expired') }]} />
      {loading ? <PageLoader /> : !data?.length ? <Empty icon={<ClipboardList className="h-8 w-8" />} title={t('No offers here')} /> : (
        <Card className="divide-y divide-surface-line dark:divide-white/10">
          {data.map((o) => (
            <Link key={o.id} href={o.job ? `/jobs/${o.job.id}` : `/pro/requests/${o.request.id}`} className="flex flex-col gap-2 p-4 hover:bg-surface-sunk/60 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/5">
              <div className="min-w-0"><div className="truncate font-medium text-ink dark:text-white">{o.request.title}</div><div className="text-sm text-ink-muted">{o.request.city} · v{o.currentRevision} · {timeAgo(o.updatedAt, intl)}</div></div>
              <div className="flex items-center gap-3"><span className="font-semibold tabular-nums">{money(o.latest.priceMinor, o.latest.currency, intl)}</span><StatusBadge status={o.status} /></div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
