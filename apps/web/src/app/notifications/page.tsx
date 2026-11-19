'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button, Card, Container, Empty, PageHeader, PageLoader, cx } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  const { t, intl } = useT();
  const { data, loading, reload } = useApi<{ items: any[]; unread: number }>('/notifications', { pageSize: 50 });
  useRealtime('notification', () => reload());
  return (
    <RequireAuth>
      <Container className="max-w-3xl">
        <PageHeader title={t('Notifications')} actions={<>
          <Button variant="ghost" size="sm" href="/settings#notifications">{t('Preferences')}</Button>
          {!!data?.unread && <Button variant="outline" size="sm" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); }}>{t('Mark all as read')}</Button>}
        </>} />
        {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<Bell className="h-8 w-8" />} title={t('You are all caught up')} /> : (
          <Card className="divide-y divide-surface-line overflow-hidden dark:divide-white/10">
            {data.items.map((n) => {
              const href = (n.data?.url as string) ?? '#';
              return (
                <Link key={n.id} href={href} onClick={() => !n.readAt && api(`/notifications/${n.id}/read`, { method: 'PATCH' })}
                  className={cx('flex gap-3 p-4 hover:bg-surface-sunk/60 dark:hover:bg-white/5', !n.readAt && 'bg-brand-50/50 dark:bg-brand-900/10')}>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink dark:text-white">{n.title}</div>
                    <div className="text-sm text-ink-soft dark:text-white/70">{n.body}</div>
                    <div className="mt-0.5 text-xs text-ink-muted">{timeAgo(n.createdAt, intl)}</div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </Container>
    </RequireAuth>
  );
}
