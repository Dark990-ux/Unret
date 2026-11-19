'use client';

import { useState } from 'react';
import { Button, Card, Input, PageHeader, PageLoader } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Audit /></AdminShell>;
}

function Audit() {
  const { t, intl } = useT();
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [q, setQ] = useState({ action: '', entityId: '', page: 1 });
  const { data, loading } = useApi<{ items: any[]; totalPages: number }>('/admin/audit', { ...q, pageSize: 50 });
  return (
    <>
      <PageHeader title={t('Audit log')} subtitle={t('All sensitive administrative actions and important state changes.')} />
      <form onSubmit={(e) => { e.preventDefault(); setQ({ action, entityId, page: 1 }); }} className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={t('Action prefix, e.g. admin.')} value={action} onChange={(e) => setAction(e.target.value)} />
        <Input className="max-w-xs" placeholder={t('Entity ID')} value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        <Button type="submit" variant="outline">{t('Filter')}</Button>
      </form>
      {loading ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-ink-muted"><tr className="border-b border-surface-line dark:border-white/10">{[t('Time'), t('Actor'), t('Action'), t('Entity'), t('Details'), 'IP'].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={a.id} className="border-b border-surface-line align-top last:border-0 dark:border-white/10">
                  <td className="whitespace-nowrap p-3">{dateTime(a.createdAt, intl)}</td>
                  <td className="p-3">{a.actor?.name ?? t('System')}{a.actor?.role === 'ADMIN' && ' 🛡️'}</td>
                  <td className="p-3 font-mono text-xs">{a.action}</td>
                  <td className="p-3 text-xs">{a.entityType}<div className="font-mono text-ink-muted">{a.entityId}</div></td>
                  <td className="max-w-xs p-3"><code className="block truncate text-xs" title={JSON.stringify(a.metadata)}>{JSON.stringify(a.metadata)}</code></td>
                  <td className="p-3 text-xs">{a.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={q.page <= 1} onClick={() => setQ({ ...q, page: q.page - 1 })}>{t('Previous')}</Button>
          <Button size="sm" variant="outline" disabled={q.page >= data.totalPages} onClick={() => setQ({ ...q, page: q.page + 1 })}>{t('Next')}</Button>
        </div>
      )}
    </>
  );
}
