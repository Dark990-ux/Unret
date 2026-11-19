import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUploader } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Alert, Button, Loader, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, intl } = useT();
  const th = useTheme();
  const { me } = useAuth();
  const { data, loading, setData } = useApi<{ conversation: any; messages: any[] }>(`/conversations/${id}/messages`);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<FlatList>(null);
  const up = useUploader('message');

  useRealtime<any>('message', (m) => {
    if (m.conversationId !== id) return;
    setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
  });
  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: false }), 50); }, [data?.messages.length]);

  const send = async (attachmentKey?: string) => {
    if (!text.trim() && !attachmentKey) return;
    setSending(true); setErr(null);
    try {
      const m = await api(`/conversations/${id}/messages`, { body: { body: text.trim(), attachmentKey } });
      setText('');
      setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, { ...m, mine: true }] } : d));
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); }
  };

  if (loading || !data) return <Loader />;
  const c = data.conversation;
  const isCustomer = c.customer.id === me?.id;
  const other = isCustomer ? c.professional.businessName ?? c.professional.user.name : c.customer.name;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: th.bg }}>
      <Stack.Screen options={{ title: other }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {(c.request || c.job) && (
          <Pressable onPress={() => router.push(c.job ? `/jobs/${c.job.id}` : isCustomer ? `/requests/${c.request.id}` : `/pro/requests/${c.request.id}`)}
            style={{ padding: 10, backgroundColor: th.card, borderBottomWidth: 1, borderColor: th.line }} accessibilityRole="link">
            <Text variant="small" numberOfLines={1}>📋 {c.request?.title}{c.job ? ` · ${t('Go to job')}` : ` · ${t('View request')}`}</Text>
          </Pressable>
        )}
        <FlatList ref={list} data={data.messages} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item: m }) => m.kind === 'SYSTEM' ? (
            <Text variant="small" style={{ textAlign: 'center', paddingVertical: 4 }}>{m.body}</Text>
          ) : (
            <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: m.mine ? th.brand : th.card, borderRadius: 16, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4, padding: 10, borderWidth: m.mine ? 0 : 1, borderColor: th.line }}>
              {m.attachmentUrl && (m.attachmentMime === 'application/pdf'
                ? <Text style={{ color: m.mine ? th.onBrand : th.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(absUrl(m.attachmentUrl)!)}>📄 {m.attachmentName}</Text>
                : <Pressable onPress={() => Linking.openURL(absUrl(m.attachmentUrl)!)}><Image source={{ uri: absUrl(m.attachmentUrl)! }} style={{ width: 200, height: 160, borderRadius: 10, marginBottom: 4 }} /></Pressable>)}
              {!!m.body && <Text color={m.mine ? th.onBrand : th.text}>{m.body}</Text>}
              <Text style={{ fontSize: 11, marginTop: 2, color: m.mine ? th.onBrand : th.muted, opacity: 0.75 }}>{dateTime(m.createdAt, intl)}</Text>
            </View>
          )} />
        {(err || up.error) && <View style={{ paddingHorizontal: 12 }}><Alert>{err ?? up.error}</Alert></View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderColor: th.line, backgroundColor: th.card }}>
          <Button small variant="ghost" title="📎" loading={up.busy} onPress={async () => { const f = await up.pickImage(); if (f) send(f.key); }} />
          <TextInput value={text} onChangeText={setText} placeholder={t('Write a message…')} placeholderTextColor={th.muted} multiline accessibilityLabel={t('Message')}
            style={{ flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: th.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: th.text, fontSize: 15 }} />
          <Button small title="➤" onPress={() => send()} loading={sending} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
