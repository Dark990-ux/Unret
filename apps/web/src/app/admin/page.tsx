'use client';

import Link from 'next/link';
import { AlertTriangle, Briefcase, CreditCard, Flag, LifeBuoy, Scale, ShieldCheck, UserPlus } from 'lucide-react';
import { Card, PageHeader, PageLoader, StatusBadge, cx } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { ticketRef } from '@/components/support';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <AdminShell><Overview /></AdminShell>;
}

/** What needs a person right now, for this administrator's role. */
function Overview() {
  const { t, intl } = useT();
  const { me } = useAuth();
  const { data: o, loading, reload } = useApi<any>('/admin/overview');
  useRealtime('support', () => reload());
  if (loading || !o) return <PageLoader />;
  const queue = (href: string, icon: React.ReactNode, label: string, n: number | null, sub?: string, urgent?: boolean) => n === null ? null : (
    <Link key={href + label} href={href} data-testid={`queue-${label}`}>
      <Card className={cx('h-full p-4 transition-shadow hover:shadow-md', urgent && n > 0 && 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10')}>
        <div className="flex items-center gap-2 text-sm text-ink-muted">{icon}{t(label)}</div>
        <div className={cx('mt-1 text-3xl font-semibold tabular-nums', n > 0 ? 'text-ink dark:text-white' : 'text-ink-muted')}>{n}</div>
        {sub && <div className="text-xs text-ink-muted">{sub}</div>}
      </Card>
    </Link>
  );
  return (
    <>
      <PageHeader title={t('Hello, {name}', { name: me?.name?.split(' ')[0] ?? '' })} subtitle={t('Your role: {role}. Here is what needs attention.', { role: t(({ OWNER: 'Owner', SUPPORT: 'Support', MODERATOR: 'Moderator', FINANCE: 'Finance' } as Record<string, string>)[(me as any)?.adminRole] ?? '') })} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {o.tickets && queue('/admin/support', <LifeBuoy className="h-4 w-4" />, 'Open tickets', o.tickets.open, t('{n} not assigned · {m} yours', { n: o.tickets.unassigned, m: o.tickets.mine }))}
        {o.tickets && queue('/admin/support?priority=URGENT', <AlertTriangle className="h-4 w-4" />, 'Urgent tickets', o.tickets.urgent, undefined, true)}
        {queue('/admin/disputes', <Scale className="h-4 w-4" />, 'Open disputes', o.disputes, undefined, true)}
        {queue('/admin/reports', <Flag className="h-4 w-4" />, 'Reports to review', o.reports)}
        {queue('/admin/verifications', <ShieldCheck className="h-4 w-4" />, 'Verifications waiting', o.verifications)}
        {queue('/admin/payments?status=FAILED', <CreditCard className="h-4 w-4" />, 'Failed payments (7 days)', o.failedPayments)}
        {queue('/admin/payments', <CreditCard className="h-4 w-4" />, 'Payouts stuck > 1 day', o.stuckPayouts, t('Completed jobs whose money is still held'), true)}
        {queue('/admin/plans', <CreditCard className="h-4 w-4" />, 'Plans with failed renewal', o.pastDue)}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {o.tickets && (
          <Card className="p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-ink dark:text-white">{t('Latest open tickets')}</h2><Link href="/admin/support" className="text-sm text-brand-700">{t('All tickets')} →</Link></div>
            {!o.recentTickets.length ? <p className="text-sm text-ink-muted">{t('No open tickets. 🎉')}</p> : (
              <ul className="divide-y divide-surface-line dark:divide-white/10">
                {o.recentTickets.map((x: any) => (
                  <li key={x.id}><Link href={`/admin/support/${x.id}`} className="flex items-center gap-3 py-2.5 hover:text-brand-700">
                    <span className="text-xs text-ink-muted">{ticketRef(x.number)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{x.subject} <span className="text-ink-muted">· {x.user?.name ?? x.name}</span></span>
                    <StatusBadge status={x.priority} /><span className="text-xs text-ink-muted">{timeAgo(x.lastMessageAt, intl)}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Last 24 hours')}</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-ink-muted"><UserPlus className="h-4 w-4" />{t('New accounts')}</span><b>{o.today.newUsers}</b></li>
            <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-ink-muted"><Flag className="h-4 w-4" />{t('New requests')}</span><b>{o.today.newRequests}</b></li>
            <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-ink-muted"><Briefcase className="h-4 w-4" />{t('Jobs in progress')}</span><b>{o.today.activeJobs}</b></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
