import { router, Stack } from 'expo-router';
import { Platform, Pressable, Text } from 'react-native';
import { saveSession } from '@/lib/api';
import { secureStorage } from '@/lib/storage';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider, useT } from '@/lib/i18n';
import { NotificationBanner, usePushNavigation } from '@/components/notify';

function BackButton() {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" accessibilityLabel={tr('Back')} hitSlop={10}
      style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 4 }}>
      <Text style={{ color: t.brand, fontSize: 26, lineHeight: 26, marginRight: 2 }}>‹</Text>
      <Text style={{ color: t.brand, fontSize: 16, fontWeight: '600' }}>{tr('Back')}</Text>
    </Pressable>
  );
}

function Nav() {
  const t = useTheme();
  const { t: tr } = useT();
  usePushNavigation();
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerTitleStyle: { fontWeight: '600' }, contentStyle: { backgroundColor: t.bg }, headerBackVisible: false, headerLeft: () => <BackButton /> }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: tr('Find professionals') }} />
        <Stack.Screen name="pros/[id]" options={{ title: '' }} />
        <Stack.Screen name="requests/new" options={{ title: tr('Post a request'), presentation: 'modal' }} />
        <Stack.Screen name="requests/[id]" options={{ title: tr('Request details') }} />
        <Stack.Screen name="pro/requests/[id]" options={{ title: tr('Request details') }} />
        <Stack.Screen name="pro/onboard" options={{ title: tr('Offer your services') }} />
        <Stack.Screen name="help/index" options={{ title: tr('Help & support') }} />
        <Stack.Screen name="help/new" options={{ title: tr('Write to UNRET') }} />
        <Stack.Screen name="help/[id]" options={{ title: tr('Support') }} />
        <Stack.Screen name="pro/plans" options={{ title: tr('Plans') }} />
        <Stack.Screen name="pro/payout" options={{ title: tr('Payout account (IBAN)') }} />
        <Stack.Screen name="pro/availability" options={{ title: tr('Calendar & availability') }} />
        <Stack.Screen name="jobs/[id]" options={{ title: tr('Job') }} />
        <Stack.Screen name="messages/[id]" options={{ title: tr('Messages') }} />
        <Stack.Screen name="notifications" options={{ title: tr('Notifications') }} />
        <Stack.Screen name="settings" options={{ title: tr('Settings') }} />
      </Stack>
      <NotificationBanner />
    </>
  );
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as any).__unretPreview = {
    async switchUser(session: { accessToken: string; refreshToken: string }, mode: 'customer' | 'professional') {
      await secureStorage.set('unret.mode', mode);
      await saveSession(session);
      if (router.canDismiss()) router.dismissAll();
      router.replace('/(tabs)');
    },
  };
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AuthProvider>
            <Nav />
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
