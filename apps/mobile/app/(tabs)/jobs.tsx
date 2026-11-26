import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Card, Empty, Loader, Row, Screen, Section, Segmented, StatusBadge, Text } from '@/components/ui';
import { PaymentStateBadge } from '@/components/payment';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { jobNeedsMe } from '@/lib/work';


/**
 * "Jobs" tab (customers and professionals): everything agreed with an offer.
 * Active jobs are grouped so the next thing to do is always on top.
 */
export default function Jobs() {
  const { t } = useT();
  const { mode } = useAuth();
  const as = mode === 'professional' ? 'professional' : 'customer';
  const [filter, setFilter] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');
  const { data, loading, refresh, refreshing, reload } = useApi<{ items: any[] }>('/jobs', { as, filter, pageSize: 50 });
  useRealtime('notification', () => reload());
  const items = data?.items ?? [];
  const start = (j: any) => (j.scheduledStartAt ? new Date(j.scheduledStartAt).getTime() : Infinity);
  const groups: [string, any[]][] = filter === 'active'
    ? [
        [t('Needs your action'), items.filter((j) => jobNeedsMe(j, as))],
        [t('In progress'), items.filter((j) => !jobNeedsMe(j, as) && j.status === 'IN_PROGRESS')],
        [t('Scheduled'), items.filter((j) => !jobNeedsMe(j, as) && j.status !== 'IN_PROGRESS' && j.scheduledStartAt).sort((a, b) => start(a) - start(b))],
        [t('Not scheduled yet'), items.filter((j) => !jobNeedsMe(j, as) && j.status !== 'IN_PROGRESS' && !j.scheduledStartAt)],
      ]
    : [['', items]];
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="small">{as === 'customer' ? t('Work you agreed with professionals: upcoming visits, jobs in progress and past jobs.') : t('Work customers hired you for: upcoming visits, jobs in progress and past jobs.')}</Text>
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'active', label: t('Upcoming and active') }, { value: 'completed', label: t('Completed') }, { value: 'cancelled', label: t('Cancelled') }, { value: 'all', label: t('All') }]} />
      {loading && !data ? <Loader /> : !items.length ? (
        <Empty title={filter === 'active' ? t('No upcoming or active jobs') : t('No jobs here')}
          text={filter === 'active' ? (as === 'customer' ? t('When you accept an offer, the job appears here.') : t('When a customer accepts your offer, the job appears here.')) : undefined} />
      ) : groups.filter(([, js]) => js.length).map(([title, js]) => {
        const list = <View style={{ gap: 10 }}>{js.map((j) => <JobCard key={j.id} j={j} as={as} />)}</View>;
        return title ? <Section key={title} title={`${title} · ${js.length}`}>{list}</Section> : <View key="all">{list}</View>;
      })}
    </Screen>
  );
}

function JobCard({ j, as }: { j: any; as: 'customer' | 'professional' }) {
  const { t, intl } = useT();
  return (
    <Card onPress={() => router.push(`/jobs/${j.id}`)}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{j.title}</Text><StatusBadge status={j.status} /></Row>
      <Text variant="small">{as === 'customer' ? j.professionalName : j.customerName} · {money(j.agreedPriceMinor, j.currency, intl)}</Text>
      <Text variant="small">📅 {j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</Text>
      <Row gap={6}>
        {j.paymentState && j.status !== 'CANCELLED' && <PaymentStateBadge state={j.paymentState} />}
        {j.pendingChanges > 0 && <Badge tone="amber">{as === 'customer' ? t('Change awaiting your approval') : t('Pending change')}</Badge>}
        {j.awaitingMyConfirmation && <Badge tone="violet">{t('Please confirm completion')}</Badge>}
        {j.status === 'COMPLETED' && as === 'customer' && j.reviewed === false && <Badge tone="blue">{t('Leave a review')}</Badge>}
      </Row>
    </Card>
  );
}
