'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card, Input, PageHeader, PageLoader, Select, StatusBadge } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { date } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Users /></AdminShell>;
}

function Users() {
  const { t, intl } = useT();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState({ q: '', status: '', type: '' });
  const { data, loading } = useApi<{ items: any[]; total: number }>('/admin/users', { ...query, pageSize: 50 });
  return (
    <>
      <PageHeader title={t('Users')} subtitle={data ? t('{n} users', { n: data.total }) : undefined} />
      <form onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, q }); }} className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px]">
        <Input placeholder={t('Search name, email, phone or ID')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search')} />
        <Select value={query.status} onChange={(e) => setQuery({ ...query, status: e.target.value })} aria-label={t('Status')}><option value="">{t('All statuses')}</option><option value="ACTIVE">{t('Active')}</option><option value="SUSPENDED">{t('Suspended')}</option><option value="DELETED">{t('Deleted')}</option></Select>
        <Select value={query.type} onChange={(e) => setQuery({ ...query, type: e.target.value })} aria-label={t('Type')}><option value="">{t('All types')}</option><option value="customer">{t('Customers only')}</option><option value="professional">{t('Professionals')}</option><option value="admin">{t('Admins')}</option></Select>
      </form>
      {loading ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-ink-muted"><tr className="border-b border-surface-line dark:border-white/10"><th className="p-3 font-medium">{t('Name')}</th><th className="p-3 font-medium">{t('Contact')}</th><th className="p-3 font-medium">{t('Roles')}</th><th className="p-3 font-medium">{t('Activity')}</th><th className="p-3 font-medium">{t('Joined')}</th><th className="p-3 font-medium">{t('Status')}</th></tr></thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id} className="border-b border-surface-line last:border-0 hover:bg-surface-sunk/50 dark:border-white/10">
                  <td className="p-3"><Link href={`/admin/users/${u.id}`} className="font-medium text-brand-700 hover:underline">{u.name}</Link></td>
                  <td className="p-3 text-ink-soft">{u.email ?? u.phone}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{u.role === 'ADMIN' && <Badge tone="red">Admin</Badge>}<Badge>{t('Customer')}</Badge>{u.professional && <Badge tone="blue">{t('Professional')}</Badge>}</div></td>
                  <td className="p-3 text-ink-soft">{t('{r} requests · {j} jobs', { r: u._count.requests, j: u._count.customerJobs })}{u.professional && ` · ${u.professional.completedJobs} ${t('as pro')}`}</td>
                  <td className="p-3 whitespace-nowrap">{date(u.createdAt, intl)}</td>
                  <td className="p-3"><StatusBadge status={u.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
