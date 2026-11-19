'use client';

import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import { Alert, Avatar, Badge, Button, Card, Field, Input, PageHeader, PageLoader, Select, Stat } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Company /></ProShell>;
}

function Company() {
  const { t, intl } = useT();
  const { data: c, loading, setData } = useApi<any>('/companies/me');
  const stats = useApi<any>(c && c.myRole !== 'MEMBER' ? '/companies/me/stats' : null);
  const [invite, setInvite] = useState({ email: '', role: 'MEMBER' });
  const [err, setErr] = useState<string | null>(null);
  if (loading) return <PageLoader />;
  if (!c) return <Alert>{t('You are not part of a company.')}</Alert>;
  const manager = c.myRole !== 'MEMBER';
  const completed = stats.data?.jobsByStatus.find((x: any) => x.status === 'COMPLETED')?._count ?? 0;
  const active = stats.data?.jobsByStatus.filter((x: any) => ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS'].includes(x.status)).reduce((s: number, x: any) => s + x._count, 0) ?? 0;
  return (
    <>
      <PageHeader title={c.displayName} subtitle={`${c.legalName} · ${c.registrationNumber}`} actions={<Button variant="outline" href="/jobs?as=company">{t('Company jobs')}</Button>} />
      {manager && stats.data && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('Active jobs')} value={active} />
          <Stat label={t('Completed jobs')} value={completed} />
          <Stat label={t('Revenue (completed)')} value={money(stats.data.completedRevenue[0]?._sum.agreedPriceMinor ?? 0, stats.data.completedRevenue[0]?.currency ?? 'RON', intl)} />
          <Stat label={t('Rating')} value={stats.data.rating.avg ? stats.data.rating.avg.toFixed(1) : '—'} hint={t('{n} reviews', { n: stats.data.rating.count })} />
        </div>
      )}
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-semibold text-ink dark:text-white">{t('Team members')}</h2>
        <ul className="divide-y divide-surface-line dark:divide-white/10">
          {c.members.map((m: any) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <Avatar name={m.user.name} size={36} />
              <div className="min-w-0 flex-1"><div className="font-medium text-ink dark:text-white">{m.user.name}</div><div className="truncate text-sm text-ink-muted">{m.user.email}</div></div>
              <Badge tone={m.role === 'OWNER' ? 'green' : m.role === 'MANAGER' ? 'blue' : 'gray'}>{t(m.role[0] + m.role.slice(1).toLowerCase())}</Badge>
              {manager && m.role !== 'OWNER' && <button onClick={async () => setData(await api(`/companies/me/members/${m.userId}`, { method: 'DELETE' }))} className="p-1.5 text-ink-muted hover:text-red-600" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
        {manager && (
          <div className="mt-4 grid gap-3 border-t border-surface-line pt-4 sm:grid-cols-[1fr_160px_auto] sm:items-end dark:border-white/10">
            <Field label={t('Add member by email')} hint={t('They need an UNRET account.')}><Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} /></Field>
            <Field label={t('Role')}><Select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}><option value="MEMBER">{t('Member')}</option><option value="MANAGER">{t('Manager')}</option></Select></Field>
            <Button onClick={async () => { setErr(null); try { setData(await api('/companies/me/members', { body: invite })); setInvite({ email: '', role: 'MEMBER' }); } catch (e) { setErr((e as Error).message); } }} disabled={!invite.email}><UserPlus className="h-4 w-4" />{t('Add')}</Button>
          </div>
        )}
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
      </Card>
    </>
  );
}
