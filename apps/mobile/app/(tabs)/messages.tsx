import { router } from 'expo-router';
import { View } from 'react-native';
import { Avatar, Badge, Card, Empty, Loader, Row, Screen, Text } from '@/components/ui';
import { absUrl } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Messages() {
  const { t, intl } = useT();
  const { data, loading, reload, refresh, refreshing } = useApi<any[]>('/conversations');
  useRealtime('message', () => reload());
  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      {loading ? <Loader /> : !data?.length ? <Empty title={t('No conversations yet')} text={t('Conversations with professionals and customers appear here.')} /> : data.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/messages/${c.id}`)}>
          <Row style={{ flexWrap: 'nowrap' }} gap={12}>
            <Avatar name={c.counterpart.name} url={absUrl(c.counterpart.avatarUrl)} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{c.counterpart.name}</Text>
                <Text variant="small">{timeAgo(c.lastMessageAt, intl)}</Text>
              </Row>
              {c.request && <Text variant="small" numberOfLines={1}>{c.request.title}</Text>}
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Text numberOfLines={1} style={{ flex: 1, fontWeight: c.unread ? '600' : '400', fontSize: 14 }}>{c.lastMessage ? `${c.lastMessage.mine ? t('You') + ': ' : ''}${c.lastMessage.body || t('Attachment')}` : t('No messages yet')}</Text>
                {c.unread > 0 && <Badge tone="green">{c.unread}</Badge>}
              </Row>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
