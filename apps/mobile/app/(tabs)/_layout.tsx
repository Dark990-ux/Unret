import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/components/theme';
import { Loader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { me, loading, mode } = useAuth();
  const th = useTheme();
  const { t } = useT();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (me) api<any[]>('/conversations').then((r) => setUnread(r.reduce((s, c) => s + c.unread, 0))).catch(() => undefined);
  }, [me?.id]);
  useRealtime<{ mine: boolean }>('message', (m) => !m.mine && setUnread((x) => x + 1), !!me);

  if (loading) return <Loader />;
  if (!me) return <Redirect href="/login" />;
  const pro = mode === 'professional';
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: th.brand, tabBarInactiveTintColor: th.muted,
      tabBarStyle: { backgroundColor: th.card, borderTopColor: th.line },
      headerStyle: { backgroundColor: th.card }, headerTintColor: th.text, headerTitleStyle: { fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: icon('⌂'), headerShown: false }} />
      <Tabs.Screen name="requests" options={{ title: pro ? t('Requests') : t('My requests'), tabBarIcon: icon('▤') }} />
      <Tabs.Screen name="jobs" options={{ title: t('Jobs'), tabBarIcon: icon('⚒') }} />
      <Tabs.Screen name="messages" options={{ title: t('Messages'), tabBarIcon: icon('✉'), tabBarBadge: unread || undefined }} listeners={{ tabPress: () => setUnread(0) }} />
      <Tabs.Screen name="account" options={{ title: t('Account'), tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
