'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Archive, CheckCircle2, Clock, Download, Inbox, RotateCcw, Timer } from 'lucide-react';
import { Alert, Button, Card, Empty, Input, PageHeader, PageLoader, Select, Stat, StatusBadge } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { SUPPORT_CATEGORIES, ticketRef } from '@/components/support';
import { download } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Register /></AdminShell>;
}

/** Hours → "45 min", "6 h", "2.5 days". */
function duration(h: number | null, t: (s: string, v?: Record<string, string | number>) => string) {
  if (h === null || h === undefined) return '—';
  if (h < 1) return t('{n} min', { n: Math.max(1, Math.round(h * 60)) });
  if (h < 48) return t('{n} h', { n: Math.round(h * 10) / 10 });
  return t('{n} days', { n: Math.round((h / 24) * 10) / 10 });
}

/**
 * The permanent record of every problem reported on UNRET: open or solved, who handled it,
 * how long it took and how it was solved. Nothing here can be deleted; it can be exported to Excel.
 */
function Register() {
  const { t, intl } = useT();
  const [f, setF] = useState({ from: '', to: '', category: '', kind: '', status: 'all', q: '' });
  const [page, setPage] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const query = { ...f, page, pageSize: 50 };
  const { data, loading } = useApi<any>('/admin/support/register', query);
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setPage(1); };
  const cat = Object.fromEntries(SUPPORT_CATEGORIES.map(([v, i, l]) => [v, `${i} ${t(l)}`]));
  const exportCsv = async () => {
    setBusy(true); setErr(null);
    try { await download('/admin/support/register.csv', `unret-problems-${new Date().toISOString().slice(0, 10)}.csv`, f); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const s = data?.stats;
  return (
    <>
      <PageHeader title={t('Problem register')} subtitle={t('Every question and problem ever sent to UNRET, open or solved, with how it was solved. Records are kept permanently and cannot be deleted.')}
        actions={<Button variant="outline" loading={busy} onClick={exportCsv}><Download className="h-4 w-4" />{t('Export to Excel')}</Button>} />
      {err && <div className="mb-4"><Alert>{err}</Alert></div>}

      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="register-stats">
          <Stat icon={<Archive className="h-4 w-4" />} label={t('Total')} value={s.total} />
          <Stat icon={<Inbox className="h-4 w-4" />} label={t('Still open')} value={s.open} />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={t('Solved')} value={s.solved} hint={s.total ? t('{p}% of all', { p: Math.round((s.solved / s.total) * 100) }) : undefined} />
          <Stat icon={<Clock className="h-4 w-4" />} label={t('Average first reply')} value={duration(s.avgFirstResponseHours, t)} />
          <Stat icon={<Timer className="h-4 w-4" />} label={t('Average time to solve')} value={duration(s.avgResolutionHours, t)} hint={s.reopened ? <span className="inline-flex items-center gap-1"><RotateCcw className="h-3 w-3" />{t('{n} came back after being solved', { n: s.reopened })}</span> : undefined} />
        </div>
      )}

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('From')}</span><Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label={t('From')} /></label>
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('To')}</span><Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label={t('To')} /></label>
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('Status')}</span>
          <Select value={f.status} onChange={(e) => set('status', e.target.value)} aria-label={t('Status')}>
            <option value="all">{t('All')}</option><option value="open">{t('Still open')}</option><option value="solved">{t('Solved or closed')}</option>
          </Select></label>
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('Category')}</span>
          <Select value={f.category} onChange={(e) => set('category', e.target.value)} aria-label={t('Category')}>
            <option value="">{t('All')}</option>{SUPPORT_CATEGORIES.map(([v]) => <option key={v} value={v}>{cat[v]}{s?.byCategory?.[v] !== undefined && !f.category ? ` (${s.byCategory[v]})` : ''}</option>)}
          </Select></label>
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('Type')}</span>
          <Select value={f.kind} onChange={(e) => set('kind', e.target.value)} aria-label={t('Type')}>
            <option value="">{t('All')}</option><option value="problem">{t('Problem report')}</option><option value="question">{t('Question')}</option><option value="contact">{t('Contact')}</option>
          </Select></label>
        <label className="text-sm"><span className="mb-1 block text-ink-muted">{t('Search')}</span><Input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder={t('#number, name, words in messages')} aria-label={t('Search')} /></label>
      </Card>

      {loading && !data ? <PageLoader /> : !data?.items.length ? <Empty title={t('Nothing found for these filters')} /> : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm" data-testid="register-table">
              <thead><tr className="border-b border-surface-line text-left text-ink-muted dark:border-white/10">{['#', 'Received', 'Problem', 'From', 'Status', 'Handled by', 'First reply', 'Solved in', 'How it was solved'].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{t(h)}</th>)}</tr></thead>
              <tbody>
                {data.items.map((x: any) => {
                  const hrs = (a: string | null) => (a ? (new Date(a).getTime() - new Date(x.createdAt).getTime()) / 3600e3 : null);
                  return (
                    <tr key={x.id} className="border-b border-surface-line align-top last:border-0 dark:border-white/10">
                      <td className="px-3 py-2.5 text-ink-muted">{ticketRef(x.number)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{dateTime(x.createdAt, intl)}</td>
                      <td className="max-w-[240px] px-3 py-2.5"><Link href={`/admin/support/${x.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{x.subject}</Link><div className="text-xs text-ink-muted">{cat[x.category] ?? x.category} · {t('{n} messages', { n: x._count.messages })}</div></td>
                      <td className="px-3 py-2.5">{x.user?.name ?? x.name}{!x.user && <div className="text-xs text-ink-muted">{t('no account')}</div>}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={x.status} />{x.reopenCount > 0 && <div className="mt-1 text-xs text-amber-700" title={t('Came back after being solved')}>↺ {x.reopenCount}×</div>}</td>
                      <td className="px-3 py-2.5 text-ink-muted">{x.assignee?.name ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{duration(hrs(x.firstResponseAt), t)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{duration(hrs(x.resolvedAt), t)}</td>
                      <td className="max-w-[300px] px-3 py-2.5 text-ink-soft">{x.resolutionSummary ? <><span className="line-clamp-3">{x.resolutionSummary}</span><div className="text-xs text-ink-muted">— {x.resolvedBy ? (x.resolvedBy.role === 'ADMIN' ? x.resolvedBy.name : t('the person')) : t('the team')}</div></> : <span className="text-ink-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="mt-4 flex items-center justify-between text-sm text-ink-muted">
            <span>{t('{n} records', { n: data.total })}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</Button>
              <span className="self-center">{page} / {Math.max(1, data.totalPages)}</span>
              <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>{t('Next')}</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
