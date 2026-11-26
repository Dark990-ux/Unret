import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useTheme } from '@/components/theme';
import { Card, Empty, Loader, Row, Screen, Section, StatusBadge, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';
import { ticketRef } from '@/lib/support';

const FAQ: [string, string][] = [
  ['How do I get offers for a job?', 'Post a request with a clear description and photos. Matching professionals near you send offers; you compare them and accept the one you like.'],
  ['How do payments work?', 'Pay the professional directly (card, transfer or cash) or through UNRET. Through UNRET, the money is held safely and sent to the professional when the job is done; if the job is cancelled, it is refunded.'],
  ['Something went wrong with a job. What can I do?', 'First message the other person. If you cannot agree, open the job and choose "Report a problem / dispute", or contact us below and we will step in.'],
  ['I cannot sign in.', 'Use "Forgot password?" on the sign-in page to get a link by email. If that does not help, contact us and we will help you get back in.'],
];

export default function Help() {
  const th = useTheme();
  const { t, intl } = useT();
  const { me } = useAuth();
  const tickets = useApi<{ items: any[] }>(me ? '/support/tickets' : null);
  useRealtime('support', () => tickets.reload());
  const [open, setOpen] = useState<string | null>(null);
  const action = (kind: string, icon: string, title: string, text: string) => (
    <Card key={kind} onPress={() => router.push({ pathname: '/help/new', params: { kind } })} style={{ flex: 1, minWidth: 150 }}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text variant="label">{title}</Text>
      <Text variant="small">{text}</Text>
    </Card>
  );
  return (
    <Screen onRefresh={tickets.refresh} refreshing={tickets.refreshing}>
      <Text variant="small">{t('Find an answer, or write to the team that runs UNRET. We usually reply within one working day.')}</Text>
      <Row style={{ alignItems: 'stretch' }}>
        {action('question', '❓', t('Ask a question'), t('About using UNRET, your account or payments.'))}
        {action('problem', '🐞', t('Report a problem'), t('Something went wrong with a job, a payment or the app.'))}
        {action('contact', '✉️', t('Contact us'), t('Partnerships, press, ideas or anything else.'))}
      </Row>
      {me && (
        <Section title={t('Your conversations with support')}>
          {tickets.loading ? <Loader /> : !tickets.data?.items.length ? <Empty title={t('No messages yet')} text={t('When you write to us, the conversation appears here.')} /> : tickets.data.items.map((x) => (
            <Card key={x.id} onPress={() => router.push(`/help/${x.id}`)}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{ticketRef(x.number)} · {x.subject}</Text>
                <StatusBadge status={x.status} />
              </Row>
              {x.lastMessage && <Text variant="small" numberOfLines={2}>{x.lastMessage.fromStaff ? `${t('UNRET Support')}: ` : `${t('You')}: `}{x.lastMessage.body}</Text>}
              <Text variant="small" style={{ color: th.muted }}>{timeAgo(x.lastMessageAt, intl)}</Text>
            </Card>
          ))}
        </Section>
      )}
      <Section title={t('Common questions')}>
        <Card style={{ gap: 0 }}>
          {FAQ.map(([q, a], i) => (
            <Pressable key={q} onPress={() => setOpen(open === q ? null : q)} accessibilityRole="button" style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: th.line, gap: 6 }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" style={{ flex: 1 }}>{t(q)}</Text><Text style={{ color: th.muted }}>{open === q ? '−' : '+'}</Text></Row>
              {open === q && <Text variant="small">{t(a)}</Text>}
            </Pressable>
          ))}
        </Card>
      </Section>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text variant="small">{t('If someone is in danger, call 112 first.')}</Text>
        <Text variant="small" color={th.brand} onPress={() => Linking.openURL('tel:112')}>📞 112</Text>
      </View>
    </Screen>
  );
}
