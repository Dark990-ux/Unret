'use client';

import Link from 'next/link';
import { MessagesSquare } from 'lucide-react';
import { Avatar, Badge, Card, Empty, PageLoader } from './ui';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export function ConversationList({ activeId }: { activeId?: string }) {
  const { t, intl } = useT();
  const { data, loading, reload } = useApi<any[]>('/conversations');
  useRealtime('message', () => reload());
  if (loading) return <PageLoader />;
  if (!data?.length) return <Empty icon={<MessagesSquare className="h-8 w-8" />} title={t('No conversations yet')} text={t('Conversations with professionals and customers appear here.')} />;
  return (
    <Card className="divide-y divide-surface-line overflow-hidden dark:divide-white/10">
      {data.map((c) => (
        <Link key={c.id} href={`/messages/${c.id}`} className={`flex gap-3 p-4 hover:bg-surface-sunk/60 dark:hover:bg-white/5 ${activeId === c.id ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}`}>
          <Avatar name={c.counterpart.name} url={c.counterpart.avatarUrl} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-ink dark:text-white">{c.counterpart.name}</span>
              <span className="shrink-0 text-xs text-ink-muted">{timeAgo(c.lastMessageAt, intl)}</span>
            </div>
            {c.request && <div className="truncate text-xs text-brand-700 dark:text-brand-300">{c.request.title}</div>}
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate text-sm ${c.unread ? 'font-medium text-ink dark:text-white' : 'text-ink-muted'}`}>{c.lastMessage ? `${c.lastMessage.mine ? t('You') + ': ' : ''}${c.lastMessage.body || t('Attachment')}` : t('No messages yet')}</span>
              {c.unread > 0 && <Badge tone="green">{c.unread}</Badge>}
            </div>
          </div>
        </Link>
      ))}
    </Card>
  );
}

