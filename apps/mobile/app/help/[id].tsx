import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, TextInput, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Alert, Button, Loader, Row, StatusBadge, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { ticketRef } from '@/lib/support';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const th = useTheme();
  const { t, intl } = useT();
  const { data: tk, loading, setData, reload } = useApi<any>(`/support/tickets/${id}`);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [solving, setSolving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  useRealtime<any>('support', (e) => e.ticketId === id && reload());
  if (loading || !tk) return <Loader />;
  const send = async () => {
    setBusy(true); setErr(null);
    try { show(await api(`/support/tickets/${id}/messages`, { body: { body } })); setBody(''); setTimeout(() => scroll.current?.scrollToEnd(), 50); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  // Use the answer only if it is the whole conversation; otherwise load it again (never draw a half answer).
  const show = (x: any) => (x && Array.isArray(x.messages) ? setData(x) : reload());
  const solved = async () => {
    setSolving(true); setErr(null);
    try { show(await api(`/support/tickets/${id}/solved`, { method: 'POST' })); } catch (e) { setErr((e as Error).message); } finally { setSolving(false); }
  };
  const closed = tk.status === 'CLOSED';
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `${ticketRef(tk.number)}` }} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 10 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <Text variant="h2">{tk.subject}</Text>
        <Row><StatusBadge status={tk.status} /></Row>
        {(tk.messages ?? []).map((m: any) => (
          <View key={m.id} testID="ticket-message" style={{ alignSelf: m.fromStaff ? 'flex-start' : 'flex-end', maxWidth: '86%', backgroundColor: m.fromStaff ? th.card : th.brand, borderRadius: 16, padding: 10, borderWidth: m.fromStaff ? 1 : 0, borderColor: th.line, gap: 2 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: m.fromStaff ? th.brand : th.onBrand, opacity: 0.9 }}>{m.author}</Text>
            <Text color={m.fromStaff ? th.text : th.onBrand}>{m.body}</Text>
            {m.attachments?.map((a: any) => <Text key={a.key} color={m.fromStaff ? th.brand : th.onBrand} style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(absUrl(a.url)!)}>📎 {a.name}</Text>)}
            <Text style={{ fontSize: 11, color: m.fromStaff ? th.muted : th.onBrand, opacity: 0.75 }}>{dateTime(m.createdAt, intl)}</Text>
          </View>
        ))}
        {tk.status === 'WAITING_USER' && <Alert tone="blue">{t('UNRET Support replied. Answer below if you need anything else.')}</Alert>}
        {!['RESOLVED', 'CLOSED'].includes(tk.status) && <Button small variant="ghost" title={`✓ ${t('My problem is solved')}`} onPress={solved} loading={solving} />}
        {tk.status === 'RESOLVED' && <Alert tone="green">{t('Glad it is solved! If anything is still not right, just reply and the conversation opens again.')}</Alert>}
        {err && <Alert>{err}</Alert>}
      </ScrollView>
      {closed ? <View style={{ padding: 12 }}><Alert tone="amber">{t('This conversation is closed. Please open a new one.')}</Alert></View> : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderColor: th.line, backgroundColor: th.card }}>
          <TextInput value={body} onChangeText={setBody} placeholder={t('Write a reply…')} placeholderTextColor={th.muted} multiline accessibilityLabel={t('Reply')}
            style={{ flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: th.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: th.text, fontSize: 15 }} />
          <Button small title="➤" onPress={send} loading={busy} disabled={!body.trim()} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
