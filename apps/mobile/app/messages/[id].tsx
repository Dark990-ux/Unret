import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUploader } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Alert, Button, Loader, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { emitRealtime, signal, useRealtime } from '@/lib/realtime';

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, intl } = useT();
  const th = useTheme();
  const { me } = useAuth();
  const { data, loading, setData } = useApi<{ conversation: any; messages: any[]; hasMore?: boolean; otherLastReadAt?: string | null }>(`/conversations/${id}/messages`);
  const [typing, setTyping] = useState(false);
  const [older, setOlder] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);
  const keepBottom = useRef(true);
  useEffect(() => { if (data) signal('unread'); }, [!!data]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<FlatList>(null);
  const up = useUploader('message');

  useRealtime<any>('message', (m) => {
    if (m.conversationId !== id) return;
    setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
    if (!m.mine) { setTyping(false); api(`/conversations/${id}/read`, { method: 'POST' }).then(() => signal('unread')).catch(() => undefined); }
  });
  useRealtime<any>('read', (e) => { if (e.conversationId === id) setData((d) => (d ? { ...d, otherLastReadAt: e.readAt } : d)); });
  useRealtime<any>('typing', (e) => {
    if (e.conversationId !== id) return;
    setTyping(e.typing);
    clearTimeout(typingTimer.current);
    if (e.typing) typingTimer.current = setTimeout(() => setTyping(false), 6000);
  });
  useEffect(() => { if (keepBottom.current) setTimeout(() => list.current?.scrollToEnd({ animated: false }), 50); keepBottom.current = true; }, [data?.messages.length, typing]);
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - lastTypingSent.current > 2500) { lastTypingSent.current = now; emitRealtime('typing', { conversationId: id, typing: true }); }
  };
  const loadOlder = async () => {
    if (!data?.messages.length) return;
    setOlder(true);
    try {
      const r = await api<any>(`/conversations/${id}/messages`, { query: { before: data.messages[0].createdAt } });
      keepBottom.current = false;
      setData((d) => (d ? { ...d, hasMore: r.hasMore, messages: [...r.messages.filter((m: any) => !d.messages.some((x) => x.id === m.id)), ...d.messages] } : d));
    } catch (e) { setErr((e as Error).message); } finally { setOlder(false); }
  };

  const send = async (attachmentKey?: string) => {
    if (!text.trim() && !attachmentKey) return;
    setSending(true); setErr(null);
    try {
      const m = await api(`/conversations/${id}/messages`, { body: { body: text.trim(), attachmentKey } });
      setText('');
      lastTypingSent.current = 0;
      emitRealtime('typing', { conversationId: id, typing: false });
      setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, { ...m, mine: true }] } : d));
    } catch (e) { setErr((e as Error).message); } finally { setSending(false); }
  };

  if (loading || !data) return <Loader />;
  const c = data.conversation;
  const isCustomer = c.customer.id === me?.id;
  const other = isCustomer ? c.professional.businessName ?? c.professional.user.name : c.customer.name;
  const msgs: any[] = data.messages;
  const seenAt = data.otherLastReadAt ? new Date(data.otherLastReadAt).getTime() : 0;
  const lastMine = [...msgs].reverse().find((m) => m.mine && m.kind !== 'SYSTEM');
  const dayOf = (d: string) => new Date(d).toDateString();
  const dayLabel = (d: string) => {
    const x = new Date(d), today = new Date(), y = new Date(Date.now() - 864e5);
    if (x.toDateString() === today.toDateString()) return t('Today');
    if (x.toDateString() === y.toDateString()) return t('Yesterday');
    return x.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', ...(x.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  };
  const time = (d: string) => new Date(d).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });

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
        <FlatList ref={list} data={msgs} keyExtractor={(m) => m.id} contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          ListHeaderComponent={data.hasMore ? <Button small variant="ghost" title={t('Load earlier messages')} loading={older} onPress={loadOlder} /> : null}
          ListEmptyComponent={<Text variant="small" style={{ textAlign: 'center', paddingVertical: 40 }}>{t('Say hello to {name}. Messages are private between the two of you.', { name: other })}</Text>}
          ListFooterComponent={typing ? (
            <View testID="typing" style={{ alignSelf: 'flex-start', backgroundColor: th.card, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: th.line }}>
              <Text variant="small">{t('{name} is typing…', { name: other })}</Text>
            </View>
          ) : null}
          renderItem={({ item: m, index: i }) => <View style={{ gap: 6 }}>
            {(i === 0 || dayOf(msgs[i - 1].createdAt) !== dayOf(m.createdAt)) && <Text variant="small" style={{ textAlign: 'center', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 4 }}>{dayLabel(m.createdAt)}</Text>}
            {m.kind === 'SYSTEM' ? (
            <Text variant="small" style={{ textAlign: 'center', paddingVertical: 4 }}>{m.body}</Text>
          ) : (
            <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%', backgroundColor: m.mine ? th.brand : th.card, borderRadius: 16, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4, padding: 10, borderWidth: m.mine ? 0 : 1, borderColor: th.line }}>
              {m.attachmentUrl && (m.attachmentMime === 'application/pdf'
                ? <Text style={{ color: m.mine ? th.onBrand : th.brand, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(absUrl(m.attachmentUrl)!)}>📄 {m.attachmentName}</Text>
                : <Pressable onPress={() => Linking.openURL(absUrl(m.attachmentUrl)!)}><Image source={{ uri: absUrl(m.attachmentUrl)! }} style={{ width: 200, height: 160, borderRadius: 10, marginBottom: 4 }} /></Pressable>)}
              {!!m.body && <Text color={m.mine ? th.onBrand : th.text}>{m.body}</Text>}
              <Text style={{ fontSize: 11, marginTop: 2, color: m.mine ? th.onBrand : th.muted, opacity: 0.75 }}>{time(m.createdAt)}{m.mine ? (new Date(m.createdAt).getTime() <= seenAt ? '  ✓✓' : '  ✓') : ''}</Text>
            </View>
          )}
            {m === lastMine && new Date(m.createdAt).getTime() <= seenAt && <Text variant="small" style={{ alignSelf: 'flex-end', fontSize: 11 }}>{t('Seen')}</Text>}
          </View>} />
        {(err || up.error) && <View style={{ paddingHorizontal: 12 }}><Alert>{err ?? up.error}</Alert></View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderColor: th.line, backgroundColor: th.card }}>
          <Button small variant="ghost" title="📎" loading={up.busy} onPress={async () => { const f = await up.pickImage(); if (f) send(f.key); }} />
          <TextInput value={text} onChangeText={onType} onKeyPress={(e: any) => { if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault(); send(); } }} placeholder={t('Write a message…')} placeholderTextColor={th.muted} multiline accessibilityLabel={t('Message')}
            style={{ flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: th.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: th.text, fontSize: 15 }} />
          <Button small title="➤" onPress={() => send()} loading={sending} disabled={!text.trim()} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
