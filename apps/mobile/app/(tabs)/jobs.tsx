import { router } from 'expo-router';
import { useState } from 'react';
import { Badge, Card, Empty, Loader, Row, Screen, Segmented, StatusBadge, Text } from '@/components/ui';
import { PaymentStateBadge } from '@/components/payment';
import { useAuth } from '@/lib/auth';
import { dateTime, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Jobs() {
  const { t, intl } = useT();
  const { mode } = useAuth();
  const as = mode === 'professional' ? 'professional' : 'customer';
  const [filter, setFilter] = useState<'active' | 'completed' | 'cancelled' | 'all'>('active');
  const { data, loading, refresh, refreshing } = useApi<{ items: any[] }>('/jobs', { as, filter, pageSize: 50 });
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Segmented value={filter} onChange={setFilter} items={[{ value: 'active', label: t('Active') }, { value: 'completed', label: t('Completed') }, { value: 'cancelled', label: t('Cancelled') }, { value: 'all', label: t('All') }]} />
      {loading ? <Loader /> : !data?.items.length ? <Empty title={t('No jobs here')} /> : data.items.map((j) => (
        <Card key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{j.title}</Text><StatusBadge status={j.status} /></Row>
          <Text variant="small">{as === 'customer' ? j.professionalName : j.customerName} · {money(j.agreedPriceMinor, j.currency, intl)}</Text>
          <Text variant="small">{j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</Text>
          <Row gap={6}>
            {j.paymentState && j.status !== 'CANCELLED' && <PaymentStateBadge state={j.paymentState} />}
            {j.pendingChanges > 0 && <Badge tone="amber">{t('Pending change')}</Badge>}
            {j.awaitingMyConfirmation && <Badge tone="violet">{t('Action needed')}</Badge>}
            {j.status === 'COMPLETED' && as === 'customer' && !j.reviewed && <Badge tone="blue">{t('Leave a review')}</Badge>}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
