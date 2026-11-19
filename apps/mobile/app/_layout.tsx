import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider, useT } from '@/lib/i18n';

function Nav() {
  const t = useTheme();
  const { t: tr } = useT();
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerTitleStyle: { fontWeight: '600' }, contentStyle: { backgroundColor: t.bg }, headerBackTitle: tr('Back') }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: tr('Find professionals') }} />
        <Stack.Screen name="pros/[id]" options={{ title: '' }} />
        <Stack.Screen name="requests/new" options={{ title: tr('Post a request'), presentation: 'modal' }} />
        <Stack.Screen name="requests/[id]" options={{ title: tr('Request details') }} />
        <Stack.Screen name="pro/requests/[id]" options={{ title: tr('Request details') }} />
        <Stack.Screen name="pro/onboard" options={{ title: tr('Offer your services') }} />
        <Stack.Screen name="pro/availability" options={{ title: tr('Calendar & availability') }} />
        <Stack.Screen name="jobs/[id]" options={{ title: tr('Job') }} />
        <Stack.Screen name="messages/[id]" options={{ title: tr('Messages') }} />
        <Stack.Screen name="notifications" options={{ title: tr('Notifications') }} />
        <Stack.Screen name="settings" options={{ title: tr('Settings') }} />
      </Stack>
    </>
  );
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
