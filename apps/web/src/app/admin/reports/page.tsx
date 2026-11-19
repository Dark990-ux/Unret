'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Badge, Button, Card, Empty, Input, PageHeader, PageLoader, StatusBadge, Tabs } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Reports /></AdminShell>;
}

function Reports() {
  const { t, intl } = useT();
  const [status, setStatus] = useState<'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED'>('OPEN');
  const { data, loading, reload } = useApi<{ items: any[] }>('/admin/reports', { status, pageSize: 50 });
  const [res, setRes] = useState<Record<string, string>>({});
  const link = (r: any) => ({ PROFILE: `/pros/${r.targetId}`, USER: `/admin/users/${r.targetId}`, REQUEST: `/requests/${r.targetId}`, REVIEW: `/admin/reviews`, MESSAGE: null } as Record<string, string | null>)[r.targetType];
  const act = async (id: string, s: string) => { await api(`/admin/reports/${id}`, { method: 'PATCH', body: { status: s, resolution: res[id] || undefined } }); reload(); };
  return (
    <>
      <PageHeader title={t('Reports')} />
      <Tabs value={status} onChange={setStatus} items={[{ value: 'OPEN', label: t('Open') }, { value: 'IN_REVIEW', label: t('In review') }, { value: 'RESOLVED', label: t('Resolved') }, { value: 'DISMISSED', label: t('Dismissed') }]} />
      {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<Flag className="h-8 w-8" />} title={t('No reports')} /> : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Card key={r.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge tone="red">{r.targetType}</Badge><b>{r.reason}</b><span className="text-ink-muted">{t('by')} {r.reporter.name} · {dateTime(r.createdAt, intl)}</span><StatusBadge status={r.status} /></div>
              {r.details && <p className="text-ink-soft">{r.details}</p>}
              <div className="text-xs text-ink-muted">{t('Target')}: {link(r) ? <Link href={link(r)!} className="text-brand-700">{r.targetId}</Link> : r.targetId}</div>
              {r.resolution && <p className="text-ink-soft">{t('Resolution')}: {r.resolution}</p>}
              {['OPEN', 'IN_REVIEW'].includes(r.status) && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Input className="max-w-sm" placeholder={t('Resolution note')} value={res[r.id] ?? ''} onChange={(e) => setRes({ ...res, [r.id]: e.target.value })} />
                  {r.status === 'OPEN' && <Button size="sm" variant="outline" onClick={() => act(r.id, 'IN_REVIEW')}>{t('Start review')}</Button>}
                  <Button size="sm" onClick={() => act(r.id, 'RESOLVED')}>{t('Resolve')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(r.id, 'DISMISSED')}>{t('Dismiss')}</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
