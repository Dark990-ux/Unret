'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarClock, ClipboardList, Plus, Briefcase } from 'lucide-react';
import { Badge, Button, Card, Container, Empty, PageHeader, PageLoader, StatusBadge, Tabs } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { useAuth } from '@/lib/auth';
import { dateTime, money, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Dashboard() {
  return <RequireAuth><CustomerDashboard /></RequireAuth>;
}

function CustomerDashboard() {
  const { t, intl } = useT();
  const { me } = useAuth();
  const [tab, setTab] = useState<'active' | 'draft' | 'closed' | 'all'>('active');
  const requests = useApi<{ items: any[]; total: number }>('/requests/mine', { filter: tab, pageSize: 50 });
  const jobs = useApi<{ items: any[] }>('/jobs', { as: 'customer', filter: 'active', pageSize: 10 });

  return (
    <Container>
      <PageHeader title={t('Hello, {name}', { name: me?.name.split(' ')[0] ?? '' })} subtitle={t('Your requests, offers and upcoming jobs.')}
        actions={<Button href="/requests/new"><Plus className="h-4 w-4" />{t('Post a request')}</Button>} />

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink dark:text-white"><CalendarClock className="h-5 w-5 text-brand-700" />{t('Upcoming and active jobs')}</h2>
        {jobs.loading ? <PageLoader /> : !jobs.data?.items.length ? (
          <p className="text-sm text-ink-muted">{t('No active jobs. When you accept an offer, the job appears here.')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {jobs.data.items.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink dark:text-white">{j.title}</div>
                      <div className="text-sm text-ink-muted">{j.professionalName} · {money(j.agreedPriceMinor, j.currency, intl)}</div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-ink-soft dark:text-white/70">
                    {j.scheduledStartAt ? <span>{dateTime(j.scheduledStartAt, intl)}</span> : <span className="text-ink-muted">{t('Not scheduled yet')}</span>}
                    {j.pendingChanges > 0 && <Badge tone="amber">{t('Change awaiting your approval')}</Badge>}
                    {j.awaitingMyConfirmation && <Badge tone="violet">{t('Please confirm completion')}</Badge>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink dark:text-white"><ClipboardList className="h-5 w-5 text-brand-700" />{t('My requests')}</h2>
        <Tabs value={tab} onChange={setTab} items={[{ value: 'active', label: t('Active') }, { value: 'draft', label: t('Drafts') }, { value: 'closed', label: t('Closed') }, { value: 'all', label: t('All') }]} />
        {requests.loading ? <PageLoader /> : !requests.data?.items.length ? (
          <Empty icon={<Briefcase className="h-8 w-8" />} title={t('No requests here')} text={t('Describe what you need and receive offers from professionals near you.')} action={<Button href="/requests/new">{t('Post a request')}</Button>} />
        ) : (
          <Card className="divide-y divide-surface-line dark:divide-white/10">
            {requests.data.items.map((r) => (
              <Link key={r.id} href={`/requests/${r.id}`} className="flex flex-col gap-2 p-4 hover:bg-surface-sunk/60 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/5">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink dark:text-white">{r.title}</div>
                  <div className="text-sm text-ink-muted">{r.categoryName}{r.city ? ` · ${r.city}` : ''} · {timeAgo(r.publishedAt ?? r.createdAt, intl)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.offerCount > 0 && <Badge tone="violet">{t('{n} offers', { n: r.offerCount })}</Badge>}
                  <StatusBadge status={r.job?.status ?? r.status} />
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </Container>
  );
}
