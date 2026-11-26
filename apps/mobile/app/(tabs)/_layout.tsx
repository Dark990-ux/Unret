import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '@/components/theme';
import { Loader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useRealtime, useSignal } from '@/lib/realtime';
import { jobNeedsMe, requestHasOffersToChoose } from '@/lib/work';

const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { me, loading, mode } = useAuth();
  const th = useTheme();
  const { t } = useT();
  const [unread, setUnread] = useState(0);
  const loadUnread = () => { if (me) api<any[]>('/conversations').then((r) => setUnread(r.reduce((s, c) => s + c.unread, 0))).catch(() => undefined); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadUnread, [me?.id]);
  useSignal('unread', loadUnread);
  useRealtime<{ mine: boolean }>('message', (m) => !m.mine && setUnread((x) => x + 1), !!me);

  // Badges on Requests / Jobs: how many things wait for me there (same lists the tabs show).
  const pro = mode === 'professional';
  const as = pro ? 'professional' : 'customer';
  const [badges, setBadges] = useState({ requests: 0, jobs: 0 });
  const loadBadges = () => {
    if (!me) return;
    Promise.all([
      pro ? api<any>('/requests/inbox', { query: { filter: 'new', pageSize: 50 } }).then((r) => r.total ?? r.items.length)
          : api<any>('/requests/mine', { query: { filter: 'active', pageSize: 50 } }).then((r) => r.items.filter(requestHasOffersToChoose).length),
      api<any>('/jobs', { query: { as, filter: 'active', pageSize: 50 } }).then((r) => r.items.filter((j: any) => jobNeedsMe(j, as)).length),
    ]).then(([requests, jobs]) => setBadges({ requests, jobs })).catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadBadges, [me?.id, mode]);
  useRealtime('notification', loadBadges, !!me);

  if (loading) return <Loader />;
  if (!me) return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: th.brand, tabBarInactiveTintColor: th.muted,
      tabBarStyle: { backgroundColor: th.card, borderTopColor: th.line },
      headerStyle: { backgroundColor: th.card }, headerTintColor: th.text, headerTitleStyle: { fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('Home'), tabBarIcon: icon('⌂'), headerShown: false }} />
      <Tabs.Screen name="requests" options={{ title: pro ? t('Requests') : t('My requests'), headerTitle: pro ? t('Requests for you') : t('My requests'), tabBarIcon: icon('▤'), tabBarBadge: badges.requests || undefined }} />
      <Tabs.Screen name="jobs" options={{ title: t('Jobs'), headerTitle: t('My jobs'), tabBarIcon: icon('⚒'), tabBarBadge: badges.jobs || undefined }} />
      <Tabs.Screen name="messages" options={{ title: t('Messages'), tabBarIcon: icon('✉'), tabBarBadge: unread || undefined }} listeners={{ tabPress: () => setUnread(0) }} />
      <Tabs.Screen name="account" options={{ title: t('Account'), tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
