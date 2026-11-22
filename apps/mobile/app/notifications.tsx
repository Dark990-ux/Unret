import { router } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Button, Card, Empty, Loader, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { NOTIF_ICON, routeFor } from '@/components/notify';


export default function Notifications() {
  const { t, intl } = useT();
  const th = useTheme();
  const { data, loading, reload, refresh, refreshing } = useApi<{ items: any[]; unread: number }>('/notifications', { pageSize: 50 });
  useRealtime('notification', () => reload());
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {!!data?.unread && <Button small variant="outline" title={t('Mark all as read')} onPress={async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); }} />}
      {loading ? <Loader /> : !data?.items.length ? <Empty title={t('You are all caught up')} /> : data.items.map((n) => (
        <Card key={n.id} onPress={() => { if (!n.readAt) api(`/notifications/${n.id}/read`, { method: 'PATCH' }); const r = routeFor(n.data?.url); if (r) router.push(r as any); }}
          style={!n.readAt ? { borderColor: th.brand } : undefined}>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={10}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.readAt ? 'transparent' : th.brand }} />
            <Text style={{ fontSize: 18 }}>{NOTIF_ICON[n.type] ?? '🔔'}</Text>
            <View style={{ flex: 1, gap: 2 }}><Text variant="label">{n.title}</Text><Text variant="small">{n.body}</Text><Text variant="small">{timeAgo(n.createdAt, intl)}</Text></View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
