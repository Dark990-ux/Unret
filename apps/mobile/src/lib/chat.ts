import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { api } from './api';

/** Shows a problem to the person (native dialog, or the browser's alert on the web build). */
export function showError(message: string, title = 'UNRET') {
  if (Platform.OS === 'web') (globalThis as any).alert?.(message);
  else Alert.alert(title, message);
}

/** Opens (or creates) the conversation and goes to it; explains what went wrong instead of failing silently. */
export async function openChat(body: { professionalId?: string; requestId?: string }) {
  try {
    const c = await api<{ id: string }>('/conversations', { body });
    router.push(`/messages/${c.id}`);
  } catch (e) {
    showError((e as Error).message);
  }
}
