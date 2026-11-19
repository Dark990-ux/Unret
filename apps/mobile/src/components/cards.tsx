import { router } from 'expo-router';
import { money, timeAgo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Badge, Card, Row, StatusBadge, Text } from './ui';

export function InboxCard({ r }: { r: any }) {
  const { t, intl } = useT();
  return (
    <Card onPress={() => router.push(`/pro/requests/${r.requestId}`)}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{r.title}</Text>
        {r.myOffer ? <StatusBadge status={r.myOffer.status} /> : !r.viewed ? <Badge tone="sun">✦ {t('New')}</Badge> : null}
      </Row>
      <Text variant="small" numberOfLines={2}>{r.description}</Text>
      <Row gap={10}>
        <Text variant="small">{r.serviceMode === 'REMOTE' ? `🌐 ${t('Remote')}` : `📍 ${r.city ?? ''}${r.distanceKm != null ? ` · ${r.distanceKm} km` : ''}`}</Text>
        <Text variant="small">{timeAgo(r.notifiedAt, intl)}</Text>
        {r.urgency === 'EMERGENCY' && <Badge tone="red">{t('Emergency')}</Badge>}
        {r.budgetMaxMinor ? <Text variant="small">≤ {money(r.budgetMaxMinor, r.currency, intl)}</Text> : null}
      </Row>
    </Card>
  );
}
