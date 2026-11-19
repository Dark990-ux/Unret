'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, PageHeader, PageLoader, Stars, StatusBadge, Tabs } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Reviews /></AdminShell>;
}

function Reviews() {
  const { t, intl } = useT();
  const [status, setStatus] = useState<'' | 'PUBLISHED' | 'UNDER_REVIEW' | 'HIDDEN'>('');
  const { data, loading, reload } = useApi<{ items: any[] }>('/admin/reviews', { status, pageSize: 50 });
  const set = async (id: string, s: string) => { const note = s === 'HIDDEN' ? prompt(t('Moderation note (internal)')) ?? undefined : undefined; await api(`/admin/reviews/${id}`, { method: 'PATCH', body: { status: s, note } }); reload(); };
  return (
    <>
      <PageHeader title={t('Review moderation')} subtitle={t('Investigate abusive, fraudulent or policy-violating reviews.')} />
      <Tabs value={status} onChange={setStatus} items={[{ value: '', label: t('All') }, { value: 'PUBLISHED', label: t('Published') }, { value: 'UNDER_REVIEW', label: t('Under review') }, { value: 'HIDDEN', label: t('Hidden') }]} />
      {loading ? <PageLoader /> : (
        <div className="space-y-3">
          {data?.items.map((r) => (
            <Card key={r.id} className="space-y-1.5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Stars value={r.overall} /><b>{r.customer.name}</b> → <Link href={`/pros/${r.professional.id}`} className="text-brand-700">{r.professional.businessName ?? r.professional.user.name}</Link><span className="text-ink-muted">{date(r.createdAt, intl)}</span><StatusBadge status={r.status} />{r.openReports && <Badge tone="red">{t('Reported')}</Badge>}</div>
              {r.text && <p className="text-ink-soft">{r.text}</p>}
              {r.moderationNote && <p className="text-xs text-ink-muted">{t('Note')}: {r.moderationNote}</p>}
              <div className="flex gap-2 pt-1">
                {r.status !== 'PUBLISHED' && <Button size="sm" variant="outline" onClick={() => set(r.id, 'PUBLISHED')}>{t('Publish')}</Button>}
                {r.status !== 'UNDER_REVIEW' && <Button size="sm" variant="outline" onClick={() => set(r.id, 'UNDER_REVIEW')}>{t('Hold for review')}</Button>}
                {r.status !== 'HIDDEN' && <Button size="sm" variant="danger" onClick={() => set(r.id, 'HIDDEN')}>{t('Hide')}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
