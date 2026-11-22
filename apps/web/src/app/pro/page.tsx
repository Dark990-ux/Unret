'use client';

import Link from 'next/link';
import { CalendarClock, CheckCircle2, Circle, Inbox, ClipboardList, Star, Wallet } from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader, PageLoader, Stat, StatusBadge } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { dateTime, money, responseTime, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { UsageCard } from '@/components/plans';

export default function Page() {
  return <ProShell><Overview /></ProShell>;
}

function Overview() {
  const { t, intl } = useT();
  const pro = useApi<any>('/professionals/me');
  const inbox = useApi<{ items: any[]; total: number }>('/requests/inbox', { filter: 'new', pageSize: 5 });
  const jobs = useApi<{ items: any[]; total: number }>('/jobs', { as: 'professional', filter: 'active', pageSize: 5 });
  const offers = useApi<any[]>('/offers/mine', { status: 'PENDING' });
  const plan = useApi<any>('/subscriptions/summary');
  const earnings = useApi<{ totals: any[] }>('/payments', { as: 'professional', pageSize: 1 });
  if (pro.loading || !pro.data) return <PageLoader />;
  const p = pro.data;
  const c = p.completeness;
  const earned = earnings.data?.totals.reduce((s: number, x: any) => s + (x._sum.payoutMinor ?? 0), 0) ?? 0;

  return (
    <>
      <PageHeader title={p.displayName} subtitle={<span className="flex items-center gap-2"><StatusBadge status={p.visibility} />{p.acceptingRequests ? t('Receiving new requests') : t('New requests paused')}</span>}
        actions={<Button variant="outline" href={`/pros/${p.id}`}>{t('View public profile')}</Button>} />

      {p.visibility !== 'PUBLIC' && (
        <Card className="mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink dark:text-white">{t('Complete your profile ({n}%)', { n: c.percent })}</h2>
            <Button size="sm" href="/pro/profile">{t('Edit profile')}</Button>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {p.visibility === 'HIDDEN' ? t('Add the essentials to start receiving requests.') : t('You already receive matching requests. Complete the rest to appear in public search.')}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunk dark:bg-white/10"><div className="h-full bg-brand-600" style={{ width: `${c.percent}%` }} /></div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {c.checks.map((x: any) => (
              <li key={x.key} className="flex items-center gap-2">
                {x.done ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : <Circle className="h-4 w-4 text-ink-muted" />}
                <span className={x.done ? 'text-ink-muted line-through' : 'text-ink dark:text-white'}>{t(x.label)}</span>
                {x.essential && !x.done && <Badge tone="amber">{t('Required')}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {p.verifications.length === 0 && (
        <div className="mb-6"><Alert tone="blue">{t('Tip: verified professionals win more jobs. Submit your identity and qualification documents in Verification.')}</Alert></div>
      )}

      <UsageCard s={plan.data} compact />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('New requests')} value={inbox.data?.total ?? '—'} icon={<Inbox className="h-4 w-4" />} />
        <Stat label={t('Pending offers')} value={offers.data?.length ?? '—'} icon={<ClipboardList className="h-4 w-4" />} />
        <Stat label={t('Rating')} value={p.ratingCount ? p.ratingAvg.toFixed(1) : '—'} hint={t('{n} reviews', { n: p.ratingCount })} icon={<Star className="h-4 w-4" />} />
        <Stat label={t('Earnings recorded')} value={money(earned, 'RON', intl)} hint={p.avgResponseMinutes != null ? t('Avg. response {t}', { t: responseTime(p.avgResponseMinutes)! }) : undefined} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold text-ink dark:text-white"><Inbox className="h-5 w-5 text-brand-700" />{t('New requests for you')}</h2><Link href="/pro/requests" className="text-sm text-brand-700">{t('See all')}</Link></div>
          {inbox.loading ? <PageLoader /> : !inbox.data?.items.length ? <p className="text-sm text-ink-muted">{t('No new requests right now. We notify you as soon as a matching request is posted.')}</p> : (
            <Card className="divide-y divide-surface-line dark:divide-white/10">
              {inbox.data.items.map((r) => (
                <Link key={r.requestId} href={`/pro/requests/${r.requestId}`} className="block p-4 hover:bg-surface-sunk/60 dark:hover:bg-white/5">
                  <div className="flex items-start justify-between gap-2"><span className="font-medium text-ink dark:text-white">{r.title}</span>{!r.viewed && <Badge tone="green">{t('New')}</Badge>}</div>
                  <div className="text-sm text-ink-muted">{r.categoryName}{r.city ? ` · ${r.city}` : ''}{r.distanceKm != null ? ` · ${r.distanceKm} km` : ''} · {timeAgo(r.notifiedAt, intl)}</div>
                </Link>
              ))}
            </Card>
          )}
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold text-ink dark:text-white"><CalendarClock className="h-5 w-5 text-brand-700" />{t('Upcoming and active jobs')}</h2><Link href="/jobs?as=professional" className="text-sm text-brand-700">{t('See all')}</Link></div>
          {jobs.loading ? <PageLoader /> : !jobs.data?.items.length ? <p className="text-sm text-ink-muted">{t('No active jobs.')}</p> : (
            <Card className="divide-y divide-surface-line dark:divide-white/10">
              {jobs.data.items.map((j) => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-start justify-between gap-2 p-4 hover:bg-surface-sunk/60 dark:hover:bg-white/5">
                  <div className="min-w-0"><div className="truncate font-medium text-ink dark:text-white">{j.title}</div><div className="text-sm text-ink-muted">{j.customerName} · {j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</div></div>
                  <StatusBadge status={j.status} />
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
