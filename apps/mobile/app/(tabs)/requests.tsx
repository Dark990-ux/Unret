import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, Empty, Loader, Row, Screen, Section, Segmented, StatusBadge, Text, Badge } from '@/components/ui';
import { requestHasOffersToChoose } from '@/lib/work';
import { useAuth } from '@/lib/auth';
import { period, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { describeAvailability } from '@/lib/availability';
import { useRealtime } from '@/lib/realtime';
import { InboxCard } from '@/components/cards';

export default function Requests() {
  const { mode } = useAuth();
  return mode === 'professional' ? <Inbox /> : <MyRequests />;
}

function MyRequests() {
  const { t } = useT();
  const th = useTheme();
  const [filter, setFilter] = useState<'active' | 'draft' | 'closed' | 'all'>('active');
  const { data, loading, refresh, refreshing, reload } = useApi<{ items: any[] }>('/requests/mine', { filter, pageSize: 50 });
  useRealtime('notification', () => reload());
  const items = data?.items ?? [];
  // Active requests grouped by what happens next; an accepted offer has become a job (see the Jobs tab).
  const groups: [string, any[], string?][] = filter === 'active'
    ? [
        [t('Offers to choose from'), items.filter(requestHasOffersToChoose)],
        [t('Waiting for offers'), items.filter((r) => !requestHasOffersToChoose(r) && r.status !== 'OFFER_ACCEPTED')],
      ]
    : [['', items]];
  const accepted = filter === 'active' ? items.filter((r) => r.status === 'OFFER_ACCEPTED').length : 0;
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="small">{t('What you asked for: professionals send you offers, you choose one.')}</Text>
      <Button title={t('Post a request')} icon="＋" onPress={() => router.push('/requests/new')} />
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'active', label: t('Active') }, { value: 'draft', label: t('Drafts') }, { value: 'closed', label: t('Closed') }, { value: 'all', label: t('All') }]} />
      {loading && !data ? <Loader /> : !items.length || (filter === 'active' && items.length === accepted) ? <Empty title={t('No requests here')} text={t('Describe what you need and receive offers from professionals near you.')} /> :
        groups.filter(([, rs]) => rs.length).map(([title, rs, hint]) => {
          const list = <View style={{ gap: 10 }}>{hint ? <Text variant="small">{hint}</Text> : null}{rs.map((r) => <RequestCard key={r.id} r={r} />)}</View>;
          return title ? <Section key={title} title={`${title} · ${rs.length}`}>{list}</Section> : <View key="all">{list}</View>;
        })}
      {/* Accepted offers became jobs: they live in the Jobs tab, not repeated here. */}
      {accepted > 0 && <Card onPress={() => router.push('/(tabs)/jobs')}><Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="small" style={{ flex: 1 }}>✓ {t('{n} requests with an accepted offer are now jobs.', { n: accepted })}</Text><Text color={th.brand}>{t('Open Jobs')} ›</Text></Row></Card>}
    </Screen>
  );
}

function RequestCard({ r }: { r: any }) {
  const { t, intl } = useT();
  return (
    <Card onPress={() => (r.status === 'OFFER_ACCEPTED' && r.job?.id ? router.push(`/jobs/${r.job.id}`) : router.push(`/requests/${r.id}`))}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{r.title}</Text><StatusBadge status={r.job?.status ?? r.status} /></Row>
      <Text variant="small">{r.categoryName}{r.city ? ` · ${r.city}` : ''} · {timeAgo(r.publishedAt ?? r.createdAt, intl)}</Text>
      <Row gap={6}>{r.directTo && <Badge tone="sun">✦ {r.directTo}</Badge>}{(describeAvailability(r, t, intl) || r.preferredDate) && <Text variant="small">📅 {describeAvailability(r, t, intl) ?? period(r.preferredDate, r.preferredDateTo, intl)}</Text>}{r.offerCount > 0 && <Badge tone="violet">{t('{n} offers', { n: r.offerCount })}</Badge>}</Row>
    </Card>
  );
}

function Inbox() {
  const { t } = useT();
  const [filter, setFilter] = useState<'new' | 'offered' | 'declined' | 'all'>('new');
  const { data, loading, refresh, refreshing, reload } = useApi<{ items: any[] }>('/requests/inbox', { filter, pageSize: 50 });
  useRealtime('notification', (n: any) => n.type === 'NEW_MATCHING_REQUEST' && reload());
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="small">{t('Requests from customers that match your services and area. Send an offer to the ones you want.')}</Text>
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'new', label: t('New') }, { value: 'offered', label: t('Offer sent') }, { value: 'declined', label: t('Not interested') }, { value: 'all', label: t('All') }]} />
      {loading ? <Loader /> : !data?.items.length ? <Empty title={t('No requests here')} text={filter === 'new' ? t('Keep your services, area and working hours up to date to receive more requests.') : undefined} /> :
        data.items.map((r) => <InboxCard key={r.requestId} r={r} />)}
    </Screen>
  );
}
