'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { Badge, Card, Container, Empty, PageHeader, PageLoader, StatusBadge, Tabs } from '@/components/ui-exports';
import { ProShell, RequireAuth } from '@/components/shell';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

type Filter = 'active' | 'upcoming' | 'completed' | 'cancelled' | 'disputed' | 'all';

function JobsList() {
  const { t, intl } = useT();
  const sp = useSearchParams();
  const as = (sp.get('as') as 'customer' | 'professional' | 'company') ?? 'customer';
  const [filter, setFilter] = useState<Filter>('active');
  const { data, loading } = useApi<{ items: any[] }>('/jobs', { as, filter, pageSize: 50 });
  return (
    <>
      <PageHeader title={as === 'customer' ? t('My jobs') : t('Jobs')} subtitle={as === 'professional' ? t('Jobs from accepted offers.') : t('Services you hired.')} />
      <Tabs value={filter} onChange={setFilter} items={[
        { value: 'active', label: t('Active') }, { value: 'completed', label: t('Completed') }, { value: 'cancelled', label: t('Cancelled') }, { value: 'disputed', label: t('Disputed') }, { value: 'all', label: t('All') },
      ]} />
      {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<Briefcase className="h-8 w-8" />} title={t('No jobs here')} /> : (
        <Card className="divide-y divide-surface-line dark:divide-white/10">
          {data.items.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-col gap-2 p-4 hover:bg-surface-sunk/60 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/5">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink dark:text-white">{j.title}</div>
                <div className="text-sm text-ink-muted">{as === 'customer' ? j.professionalName : j.customerName} · {j.categoryName} · {money(j.agreedPriceMinor, j.currency, intl)}</div>
                <div className="text-sm text-ink-soft dark:text-white/60">{j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {j.pendingChanges > 0 && <Badge tone="amber">{t('Pending change')}</Badge>}
                {j.awaitingMyConfirmation && <Badge tone="violet">{t('Action needed')}</Badge>}
                {j.status === 'COMPLETED' && as === 'customer' && !j.reviewed && <Badge tone="blue">{t('Leave a review')}</Badge>}
                <StatusBadge status={j.status} />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

function Wrapper() {
  const as = useSearchParams().get('as');
  return as === 'professional' ? <ProShell><JobsList /></ProShell> : <RequireAuth><Container><JobsList /></Container></RequireAuth>;
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><Wrapper /></Suspense>;
}
