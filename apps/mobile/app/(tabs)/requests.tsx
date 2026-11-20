import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Card, Empty, Loader, Row, Screen, Segmented, StatusBadge, Text, Badge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { period, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { InboxCard } from '@/components/cards';

export default function Requests() {
  const { mode } = useAuth();
  return mode === 'professional' ? <Inbox /> : <MyRequests />;
}

function MyRequests() {
  const { t, intl } = useT();
  const [filter, setFilter] = useState<'active' | 'draft' | 'closed' | 'all'>('active');
  const { data, loading, refresh, refreshing } = useApi<{ items: any[] }>('/requests/mine', { filter, pageSize: 50 });
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Button title={t('Post a request')} icon="＋" onPress={() => router.push('/requests/new')} />
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'active', label: t('Active') }, { value: 'draft', label: t('Drafts') }, { value: 'closed', label: t('Closed') }, { value: 'all', label: t('All') }]} />
      {loading ? <Loader /> : !data?.items.length ? <Empty title={t('No requests here')} text={t('Describe what you need and receive offers from professionals near you.')} /> :
        data.items.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/requests/${r.id}`)}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{r.title}</Text><StatusBadge status={r.job?.status ?? r.status} /></Row>
            <Text variant="small">{r.categoryName}{r.city ? ` · ${r.city}` : ''} · {timeAgo(r.publishedAt ?? r.createdAt, intl)}</Text>
            <Row gap={6}>{r.directTo && <Badge tone="sun">✦ {r.directTo}</Badge>}{r.preferredDate && <Text variant="small">📅 {period(r.preferredDate, r.preferredDateTo, intl)}</Text>}{r.offerCount > 0 && <Badge tone="violet">{t('{n} offers', { n: r.offerCount })}</Badge>}</Row>
          </Card>
        ))}
    </Screen>
  );
}

function Inbox() {
  const { t } = useT();
  const [filter, setFilter] = useState<'new' | 'offered' | 'declined' | 'all'>('new');
  const { data, loading, refresh, refreshing, reload } = useApi<{ items: any[] }>('/requests/inbox', { filter, pageSize: 50 });
  useRealtime('notification', (n: any) => n.type === 'NEW_MATCHING_REQUEST' && reload());
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'new', label: t('New') }, { value: 'offered', label: t('Offer sent') }, { value: 'declined', label: t('Not interested') }, { value: 'all', label: t('All') }]} />
      {loading ? <Loader /> : !data?.items.length ? <Empty title={t('No requests here')} text={filter === 'new' ? t('Keep your services, area and working hours up to date to receive more requests.') : undefined} /> :
        data.items.map((r) => <InboxCard key={r.requestId} r={r} />)}
    </Screen>
  );
}
