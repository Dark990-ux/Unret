import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { useTheme } from './theme';
import { Alert, Button, Text } from './ui';

export const NOTIF_ICON: Record<string, string> = {
  NEW_MATCHING_REQUEST: '📥', NEW_OFFER: '📝', OFFER_REVISED: '📝', OFFER_ACCEPTED: '🤝', OFFER_REJECTED: '📝', OFFER_MODIFICATION_REQUESTED: '✏️',
  NEW_MESSAGE: '💬', APPOINTMENT_APPROACHING: '⏰', JOB_STATUS_CHANGED: '🔧', JOB_CHANGE_PROPOSED: '✏️', JOB_CANCELLED: '✖️',
  PAYMENT_COMPLETED: '💳', PAYMENT_TO_CONFIRM: '💳', REVIEW_RECEIVED: '⭐', VERIFICATION_UPDATED: '🛡️', DISPUTE_UPDATED: '⚖️', AVAILABILITY_OPENED: '🔔', PLAN_LIMIT_REACHED: '📈', SUBSCRIPTION_UPDATED: '👑',
};

/** Maps the web addresses carried by notifications to app screens (null when the app has no such screen). */
export function routeFor(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('/pro/earnings')) return '/pro/payout';
  if (url.startsWith('/pro/reviews') || url.startsWith('/pro/verification')) return null;
  return url;
}

/** Banner at the top of the app for notifications that arrive while it is open. Tapping opens the right screen. */
export function NotificationBanner() {
  const { me } = useAuth();
  const th = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [n, setN] = useState<any | null>(null);
  const y = useRef(new Animated.Value(-160)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const hide = () => Animated.timing(y, { toValue: -160, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setN(null));

  useRealtime<any>('notification', (x) => {
    if (x.type === 'NEW_MESSAGE' && x.data?.url === pathname) return; // already reading this chat
    setN(x);
    Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, 6000);
  }, !!me);

  if (!n) return null;
  const go = routeFor(n.data?.url);
  return (
    <Animated.View style={{ position: 'absolute', left: 10, right: 10, top: insets.top + 6, zIndex: 1000, transform: [{ translateY: y }] }} pointerEvents="box-none">
      <Pressable testID="toast" accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}`}
        onPress={() => { hide(); if (go) { api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => undefined); router.push(go as any); } }}
        style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: th.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: th.line, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
        <Text style={{ fontSize: 22 }}>{NOTIF_ICON[n.type] ?? '🔔'}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>{n.title}</Text>
          <Text variant="small" numberOfLines={2}>{n.body}</Text>
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityLabel="Close"><Text style={{ color: th.muted, fontSize: 18 }}>×</Text></Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** Tapping a push notification (app in background or closed) opens the screen it is about. */
export function usePushNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const go = routeFor((r?.notification.request.content.data as any)?.url);
      if (go) router.push(go as any);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

/** "Notify me when X is free" — on a professional's profile. */
export function AvailabilityAlertButton({ professionalId, name }: { professionalId: string; name: string }) {
  const { me } = useAuth();
  const th = useTheme();
  const { t, intl } = useT();
  const [st, setSt] = useState<{ active: boolean; nextFree: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me) api<any>(`/availability/${professionalId}/alert`).then(setSt).catch(() => setSt(null)); }, [me, professionalId]);
  // The alert fired while this profile is open: show the new state right away.
  useRealtime<any>('notification', (n) => { if (n.type === 'AVAILABILITY_OPENED' && n.data?.professionalId === professionalId) api<any>(`/availability/${professionalId}/alert`).then(setSt).catch(() => undefined); }, !!me);
  if (!me || !st) return null;
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (st.nextFree && !st.active) return <Text variant="small" color="#047857" testID="free-from">✓ {t('{name} has free time from {date}', { name, date: day(st.nextFree) })}</Text>;
  const toggle = async () => {
    setBusy(true); setErr(null);
    try { const r = await api<any>(`/availability/${professionalId}/alert`, { method: st.active ? 'DELETE' : 'POST' }); setSt({ active: r.active, nextFree: r.nextFree ?? null }); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <Button title={st.active ? `🔔 ${t('We’ll tell you when {name} is free', { name })}` : `🔔 ${t('Notify me when free')}`} variant={st.active ? 'sun' : 'outline'} loading={busy} onPress={toggle} />
      {st.active && <Text variant="small" style={{ color: th.muted }}>{t('You’ll get a notification as soon as they have free days. Tap again to cancel.')}</Text>}
      {err && <Alert>{err}</Alert>}
    </View>
  );
}
