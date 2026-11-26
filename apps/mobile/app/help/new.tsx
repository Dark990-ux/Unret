import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useUploader } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Alert, Button, Card, Field, Input, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { SUPPORT_CATEGORIES } from '@/lib/support';

export default function NewTicket() {
  const th = useTheme();
  const { t } = useT();
  const { me } = useAuth();
  const p = useLocalSearchParams<{ kind?: string; jobId?: string; requestId?: string; paymentId?: string; subject?: string; category?: string }>();
  const kind = (p.kind as 'question' | 'problem' | 'contact') || 'question';
  const [category, setCategory] = useState(p.category ?? (p.jobId || p.requestId ? 'job' : p.paymentId ? 'payments' : kind === 'problem' ? 'technical' : ''));
  const [f, setF] = useState({ subject: p.subject ?? '', message: '', name: '', email: '' });
  const [files, setFiles] = useState<{ key: string; name: string }[]>([]);
  const up = useUploader('support' as any);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (me) {
        const tk = await api<any>('/support/tickets', { body: { kind, category, subject: f.subject.trim(), message: f.message.trim(), jobId: p.jobId, requestId: p.requestId, paymentId: p.paymentId, attachmentKeys: files.map((x) => x.key) } });
        router.replace(`/help/${tk.id}`);
      } else {
        const r = await api<any>('/support/contact', { body: { name: f.name, email: f.email, category, subject: f.subject, message: f.message } });
        setSent(r.number ?? 0);
      }
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (sent !== null) return <Screen><Card style={{ alignItems: 'center', gap: 8 }}><Text style={{ fontSize: 36 }}>✅</Text><Text variant="h2">{t('Thank you! We received your message.')}</Text><Text variant="small" style={{ textAlign: 'center' }}>{t('We will reply to {email}, usually within one working day.', { email: f.email })}</Text></Card></Screen>;
  const ready = !!category && f.subject.trim().length >= 3 && f.message.trim().length >= 10 && (me || (f.name.length >= 2 && /.+@.+\..+/.test(f.email)));
  return (
    <Screen>
      <Text variant="small">{kind === 'problem' ? t('Tell us what happened and we will look into it. Screenshots help a lot.') : t('Write to the team that runs UNRET.')}</Text>
      {(p.jobId || p.requestId || p.paymentId) && <Alert tone="blue">{t('This message will be linked to the {what} you came from, so we can see the details.', { what: p.jobId ? t('job') : p.requestId ? t('request') : t('payment') })}</Alert>}
      <Card>
        <Text variant="label">{t('What is it about?')} *</Text>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {SUPPORT_CATEGORIES.map(([v, icon, l]) => {
            const on = category === v;
            return (
              <Pressable key={v} onPress={() => setCategory(v)} accessibilityRole="radio" accessibilityState={{ selected: on }} testID={`cat-${v}`}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? th.brand : th.line, backgroundColor: on ? th.brandSoft : th.card }}>
                <Text style={{ fontSize: 18 }}>{icon}</Text><Text style={{ flex: 1 }}>{t(l)}</Text>
              </Pressable>
            );
          })}
        </View>
        {category === 'safety' && <Text variant="small" style={{ color: '#b91c1c' }}>{t('Safety reports go to the top of our queue. If someone is in danger, call 112 first.')}</Text>}
        {!me && <>
          <Field label={t('Your name')} required><Input value={f.name} onChangeText={(name) => setF({ ...f, name })} autoComplete="name" /></Field>
          <Field label={t('Your email')} required hint={t('We reply to this address.')}><Input value={f.email} onChangeText={(email) => setF({ ...f, email })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" /></Field>
        </>}
        <Field label={t('Subject')} required><Input value={f.subject} onChangeText={(subject) => setF({ ...f, subject })} maxLength={140} placeholder={kind === 'problem' ? t('e.g. The professional did not show up') : t('In a few words')} accessibilityLabel={t('Subject')} /></Field>
        <Field label={t('Message')} required hint={kind === 'problem' ? t('What happened, when, and what you expected. Include the job or request name if you have one.') : undefined}>
          <Input multiline value={f.message} onChangeText={(message) => setF({ ...f, message })} style={{ minHeight: 120 }} accessibilityLabel={t('Message')} />
        </Field>
        {me && (
          <Row>
            {files.map((x) => <Text key={x.key} variant="small">📎 {x.name}</Text>)}
            {files.length < 5 && <Button small variant="ghost" title={`📎 ${t('Attach a screenshot or file')}`} loading={up.busy} onPress={async () => { const r = await up.pickImage(); if (r) setFiles((s) => [...s, { key: r.key, name: r.name }]); }} />}
          </Row>
        )}
        {(err || up.error) && <Alert>{err ?? up.error}</Alert>}
        <Button title={t('Send')} onPress={submit} loading={busy} disabled={!ready} />
      </Card>
    </Screen>
  );
}
