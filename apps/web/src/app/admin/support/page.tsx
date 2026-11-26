'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Empty, Input, PageHeader, PageLoader, Select, StatusBadge, cx } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { SUPPORT_CATEGORIES, ticketRef } from '@/components/support';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <AdminShell><Suspense><Inbox /></Suspense></AdminShell>;
}

function Inbox() {
  const { t, intl } = useT();
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? 'open');
  const [priority, setPriority] = useState(sp.get('priority') ?? '');
  const [assignee, setAssignee] = useState(sp.get('assignee') ?? '');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useApi<any>('/admin/support/tickets', { status, priority: priority || undefined, assignee: assignee || undefined, q: q || undefined, pageSize: 50 });
  useRealtime('support', () => reload());
  const cat = Object.fromEntries(SUPPORT_CATEGORIES.map(([v, i]) => [v, i]));
  const tabs: [string, string, string, number | undefined][] = [['open', '', '', data?.counts.open], ['open', '', 'me', data?.counts.mine], ['open', '', 'none', data?.counts.unassigned], ['open', 'URGENT', '', data?.counts.urgent], ['WAITING_USER', '', '', data?.counts.waitingUser], ['all', '', '', undefined]];
  const tabLabel = ['Open', 'Mine', 'Not assigned', 'Urgent', 'Waiting for the person', 'All'];
  return (
    <>
      <PageHeader title={t('Support tickets')} subtitle={t('Messages and problem reports from customers, professionals and visitors.')} actions={<Link href="/admin/support/register" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">🗂️ {t('Problem register')} →</Link>} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([s, p, a, n], i) => {
          const on = status === s && priority === p && assignee === a;
          return <button key={i} onClick={() => { setStatus(s); setPriority(p); setAssignee(a); }} className={cx('rounded-full border px-3 py-1.5 text-sm', on ? 'border-brand-700 bg-brand-700 text-white' : 'border-surface-line hover:border-brand-400 dark:border-white/15')}>{t(tabLabel[i])}{n !== undefined ? ` · ${n}` : ''}</button>;
        })}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search: #number, name, email, subject')} className="ml-auto max-w-xs" aria-label={t('Search')} />
      </div>
      {loading || !data ? <PageLoader /> : !data.items.length ? <Empty title={t('No tickets here')} /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="ticket-table">
            <thead><tr className="border-b border-surface-line text-left text-ink-muted dark:border-white/10">{['#', 'Subject', 'From', 'Priority', 'Status', 'Assigned to', 'Last activity'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{t(h)}</th>)}</tr></thead>
            <tbody>
              {data.items.map((x: any) => (
                <tr key={x.id} className="border-b border-surface-line last:border-0 hover:bg-surface-sunk/50 dark:border-white/10 dark:hover:bg-white/5">
                  <td className="px-4 py-2.5 text-ink-muted">{ticketRef(x.number)}</td>
                  <td className="max-w-[280px] px-4 py-2.5"><Link href={`/admin/support/${x.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{cat[x.category] ?? '💬'} {x.subject}</Link>{x.awaitingStaff && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{t('NEW REPLY')}</span>}</td>
                  <td className="px-4 py-2.5">{x.user ? x.user.name : <span>{x.name} <span className="text-xs text-ink-muted">({t('no account')})</span></span>}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={x.priority} /></td>
                  <td className="px-4 py-2.5"><StatusBadge status={x.status} /></td>
                  <td className="px-4 py-2.5 text-ink-muted">{x.assignee?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{timeAgo(x.lastMessageAt, intl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
