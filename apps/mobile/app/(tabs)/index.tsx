import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCategories } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Badge, Button, Card, Empty, Loader, Row, Screen, Section, StatusBadge, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dateTime, money, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { InboxCard } from '@/components/cards';
import { useT } from '@/lib/i18n';

export default function Home() {
  const { mode } = useAuth();
  return mode === 'professional' ? <ProHome /> : <CustomerHome />;
}

function Header({ subtitle }: { subtitle: string }) {
  const { me } = useAuth();
  const { t } = useT();
  const th = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: th.brand }}>
      <View style={{ padding: 16, paddingBottom: 22, gap: 4 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="title" color="#fff">{t('Hi, {name}', { name: me?.name.split(' ')[0] ?? '' })}</Text>
          <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={t('Notifications')} hitSlop={10}><Text style={{ fontSize: 22, color: '#fff' }}>🔔</Text></Pressable>
        </Row>
        <Text color="#d1faec">{subtitle}</Text>
      </View>
    </SafeAreaView>
  );
}

function CustomerHome() {
  const { t, intl } = useT();
  const th = useTheme();
  const { tree } = useCategories();
  const jobs = useApi<{ items: any[] }>('/jobs', { as: 'customer', filter: 'active', pageSize: 5 });
  const reqs = useApi<{ items: any[] }>('/requests/mine', { filter: 'active', pageSize: 5 });
  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <Header subtitle={t('What do you need help with?')} />
      <Screen onRefresh={() => { jobs.refresh(); reqs.refresh(); }} refreshing={jobs.refreshing}>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Button title={t('Post a request')} icon="＋" onPress={() => router.push('/requests/new')} style={{ flex: 1 }} />
          <Button title={t('Search')} variant="outline" icon="⌕" onPress={() => router.push('/search')} style={{ flex: 1 }} />
        </Row>

        {!!jobs.data?.items.length && (
          <Section title={t('Upcoming and active jobs')}>
            {jobs.data.items.map((j) => (
              <Card key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{j.title}</Text><StatusBadge status={j.status} /></Row>
                <Text variant="small">{j.professionalName} · {money(j.agreedPriceMinor, j.currency, intl)} · {j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</Text>
                {j.awaitingMyConfirmation && <Badge tone="violet">{t('Please confirm completion')}</Badge>}
                {j.pendingChanges > 0 && <Badge tone="amber">{t('Change awaiting your approval')}</Badge>}
              </Card>
            ))}
          </Section>
        )}

        {!!reqs.data?.items.some((r) => r.status !== 'OFFER_ACCEPTED') && (
          <Section title={t('Active requests')} action={<Text color={th.brand} onPress={() => router.push('/(tabs)/requests')}>{t('See all')}</Text>}>
            {reqs.data.items.filter((r) => r.status !== 'OFFER_ACCEPTED').map((r) => (
              <Card key={r.id} onPress={() => router.push(`/requests/${r.id}`)}>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{r.title}</Text><StatusBadge status={r.status} /></Row>
                <Text variant="small">{r.categoryName} · {timeAgo(r.publishedAt ?? r.createdAt, intl)}{r.offerCount ? ` · ${t('{n} offers', { n: r.offerCount })}` : ''}</Text>
              </Card>
            ))}
          </Section>
        )}

        <Section title={t('Browse services')}>
          {tree.map((c) => (
            <Card key={c.id}>
              <Text variant="h2">{c.icon} {c.name}</Text>
              <Row gap={6}>
                {c.children.map((s) => (
                  <Pressable key={s.id} onPress={() => router.push({ pathname: '/search', params: { category: s.slug } })} accessibilityRole="button"
                    style={{ backgroundColor: th.sunk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13, color: th.soft }}>{s.name}</Text>
                  </Pressable>
                ))}
              </Row>
            </Card>
          ))}
        </Section>
      </Screen>
    </View>
  );
}

function ProHome() {
  const { t, intl } = useT();
  const th = useTheme();
  const pro = useApi<any>('/professionals/me');
  const inbox = useApi<{ items: any[]; total: number }>('/requests/inbox', { filter: 'new', pageSize: 5 });
  const jobs = useApi<{ items: any[] }>('/jobs', { as: 'professional', filter: 'active', pageSize: 5 });
  if (!pro.data) return <Loader />;
  const p = pro.data;
  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <Header subtitle={p.acceptingRequests ? t('Receiving new requests') : t('New requests paused')} />
      <Screen onRefresh={() => { pro.refresh(); inbox.refresh(); jobs.refresh(); }} refreshing={pro.refreshing}>
        {p.visibility !== 'PUBLIC' && (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}><Text variant="h2">{t('Complete your profile ({n}%)', { n: p.completeness.percent })}</Text><StatusBadge status={p.visibility} /></Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: th.sunk, overflow: 'hidden' }}><View style={{ width: `${p.completeness.percent}%`, height: 6, backgroundColor: th.brand }} /></View>
            {p.completeness.checks.filter((c: any) => !c.done).map((c: any) => <Text key={c.key} variant="small">○ {t(c.label)}{c.essential ? ` (${t('Required')})` : ''}</Text>)}
            <Text variant="small">{t('Open on the website for full editing.')}</Text>
          </Card>
        )}
        <Row style={{ flexWrap: 'nowrap' }}>
          <Card style={{ flex: 1 }}><Text variant="small">{t('New requests')}</Text><Text variant="title">{inbox.data?.total ?? '—'}</Text></Card>
          <Card style={{ flex: 1 }}><Text variant="small">{t('Rating')}</Text><Text variant="title">{p.ratingCount ? p.ratingAvg.toFixed(1) : '—'}</Text><Text variant="small">{t('{n} reviews', { n: p.ratingCount })}</Text></Card>
        </Row>
        <Section title={t('New requests for you')} action={<Text color={th.brand} onPress={() => router.push('/(tabs)/requests')}>{t('See all')}</Text>}>
          {inbox.loading ? <Loader /> : !inbox.data?.items.length ? <Text variant="small">{t('No new requests right now. We notify you as soon as a matching request is posted.')}</Text> :
            inbox.data.items.map((r) => <InboxCard key={r.requestId} r={r} />)}
        </Section>
        <Section title={t('Upcoming and active jobs')}>
          {!jobs.data?.items.length ? <Text variant="small">{t('No active jobs.')}</Text> : jobs.data.items.map((j) => (
            <Card key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{j.title}</Text><StatusBadge status={j.status} /></Row>
              <Text variant="small">{j.customerName} · {j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('Not scheduled yet')}</Text>
            </Card>
          ))}
        </Section>
      </Screen>
    </View>
  );
}

