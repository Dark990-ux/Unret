import { router } from 'expo-router';
import { View } from 'react-native';
import { useT } from '@/lib/i18n';
import { useTheme } from './theme';
import { Button, Card, Row, Text } from './ui';

const BADGE: Record<string, { label: string; icon: string; bg: string; fg: string }> = {
  vip: { label: 'VIP', icon: '👑', bg: '#ffc83d', fg: '#1b1a3a' },
  deluxe: { label: 'Deluxe', icon: '💎', bg: '#2b2fd6', fg: '#ffffff' },
  standard: { label: 'Standard', icon: '⭐', bg: '#eeefff', fg: '#2326ab' },
};

export function PlanBadge({ badge }: { badge?: string | null }) {
  const b = badge ? BADGE[badge] : null;
  if (!b) return null;
  return <View testID="plan-badge" style={{ backgroundColor: b.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}><Text style={{ color: b.fg, fontSize: 12, fontWeight: '700' }}>{b.icon} {b.label}</Text></View>;
}

/** Paid placement is disclosed to customers. */
export function PromotedLabel() {
  const { t } = useT();
  const th = useTheme();
  return <Text style={{ fontSize: 11, color: th.muted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('Promoted')}</Text>;
}

export function UsageCard({ s, compact }: { s: any; compact?: boolean }) {
  const { t } = useT();
  const th = useTheme();
  if (!s) return null;
  const limit: number | null = s.requestsPerDay;
  const pct = limit ? Math.min(100, Math.round((s.usedToday / limit) * 100)) : 100;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}><Text variant="label">{t('Your plan: {name}', { name: t(s.plan?.name ?? 'Free') })}</Text><PlanBadge badge={s.badge} /></Row>
        {compact && <Text color={th.brand} onPress={() => router.push('/pro/plans')}>{s.badge === 'vip' ? t('Manage plan') : t('Upgrade')} ›</Text>}
      </Row>
      <Text variant="small">{limit === null ? t('Unlimited new requests. Today you received {n}.', { n: s.usedToday }) : t('New requests today: {used} of {limit}', { used: Math.min(s.usedToday, limit), limit })}</Text>
      {limit !== null && <View style={{ height: 6, borderRadius: 3, backgroundColor: th.sunk, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 6, backgroundColor: pct >= 100 ? '#ffc83d' : th.brand }} /></View>}
      {limit !== null && s.missedToday > 0 && <Text variant="small" style={{ color: '#b45309', fontWeight: '600' }} testID="missed">{t('{n} more requests matched you today, but your daily limit was reached.', { n: s.missedToday })}</Text>}
      {compact && limit !== null && s.missedToday > 0 && <Button small variant="sun" title={t('See plans')} onPress={() => router.push('/pro/plans')} />}
    </Card>
  );
}
