import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCategories } from '@/components/domain';
import { hero, useTheme } from '@/components/theme';
import { Badge, Button, Card, Loader, Row, Screen, Section, StatusBadge, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { UsageCard } from '@/components/plans';
import { useT } from '@/lib/i18n';
import { jobNeedsMe, requestHasOffersToChoose } from '@/lib/work';

export default function Home() {
  const { mode } = useAuth();
  return mode === 'professional' ? <ProHome /> : <CustomerHome />;
}

function ModeSwitch() {
  const { me, mode, setMode } = useAuth();
  const { t } = useT();
  const th = useTheme();
  if (!me?.professional) return null;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('Mode')} style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
      {(['customer', 'professional'] as const).map((m) => {
        const on = mode === m;
        return (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? th.sun : 'transparent' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: on ? th.onSun : hero.text }}>{m === 'customer' ? t('Customer') : t('Professional')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Header({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) {
  const { me } = useAuth();
  const { t } = useT();
  const th = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: hero.bg, overflow: 'hidden' }}>
      {/* Decorative sun and sparkles; purely visual. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', inset: 0 }}>
        <View style={{ position: 'absolute', right: -70, top: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: '#5b5ff0', opacity: 0.55 }} />
        <View style={{ position: 'absolute', right: -40, top: -60, width: 160, height: 160, borderRadius: 80, backgroundColor: '#7b7cfa', opacity: 0.45 }} />
        <View style={{ position: 'absolute', right: 22, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: th.sun }} />
        <View style={{ position: 'absolute', left: -50, bottom: -80, width: 180, height: 180, borderRadius: 90, backgroundColor: hero.deep, opacity: 0.6 }} />
        {[[66, 30, 4], [96, 74, 3], [40, 150, 4], [14, 214, 3], [84, 250, 2]].map(([top, right, size], i) => (
          <View key={i} style={{ position: 'absolute', top, right, width: size, height: size, borderRadius: size, backgroundColor: th.sun }} />
        ))}
      </View>
      <View style={{ padding: 16, paddingBottom: 20, gap: 6 }}>
        <ModeSwitch />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="title" color={hero.text}>{t('Hi, {name}', { name: me?.name.split(' ')[0] ?? '' })}</Text>
          <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={t('Notifications')} hitSlop={10} style={{ marginRight: 46 }}><Text style={{ fontSize: 22, color: hero.text }}>🔔</Text></Pressable>
        </Row>
        <Text color={th.heroSub}>{subtitle}</Text>
        {children ? <View style={{ marginTop: 10 }}>{children}</View> : null}
      </View>
    </SafeAreaView>
  );
}

function CustomerHome() {
  const { t, intl } = useT();
  const th = useTheme();
  const { tree } = useCategories();
  const jobs = useApi<{ items: any[] }>('/jobs', { as: 'customer', filter: 'active', pageSize: 50 });
  const reqs = useApi<{ items: any[] }>('/requests/mine', { filter: 'active', pageSize: 50 });
  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <Header subtitle={t('What do you need help with?')}>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Button title={t('Post a request')} icon="＋" variant="sun" onPress={() => router.push('/requests/new')} style={{ flex: 1 }} />
          <Button title={t('Search')} icon="⌕" variant="glass" onPress={() => router.push('/search')} style={{ flex: 1 }} />
        </Row>
      </Header>
      <Screen onRefresh={() => { jobs.refresh(); reqs.refresh(); }} refreshing={jobs.refreshing}>

        {/* Jobs and requests have their own tabs; Home only shows how many and links there. */}
        <Row style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
          <Shortcut icon="⚒" label={t('Upcoming and active jobs')} value={jobs.data?.items.length} alert={jobs.data?.items.filter((j) => jobNeedsMe(j, 'customer')).length} onPress={() => router.push('/(tabs)/jobs')} />
          <Shortcut icon="▤" label={t('Active requests')} value={reqs.data?.items.filter((r) => r.status !== 'OFFER_ACCEPTED').length} alert={reqs.data?.items.filter(requestHasOffersToChoose).length} alertLabel={t('with offers')} onPress={() => router.push('/(tabs)/requests')} />
        </Row>

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
  const inbox = useApi<{ items: any[]; total: number }>('/requests/inbox', { filter: 'new', pageSize: 50 });
  const plan = useApi<any>('/subscriptions/summary');
  const jobs = useApi<{ items: any[] }>('/jobs', { as: 'professional', filter: 'active', pageSize: 50 });
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
        {/* New requests and jobs have their own tabs; Home only shows how many and links there. */}
        <Row style={{ flexWrap: 'nowrap', alignItems: 'stretch' }}>
          <Shortcut icon="▤" label={t('New requests')} value={inbox.data?.total} onPress={() => router.push('/(tabs)/requests')} />
          <Shortcut icon="⚒" label={t('Upcoming and active jobs')} value={jobs.data?.items.length} alert={jobs.data?.items.filter((j) => jobNeedsMe(j, 'professional')).length} onPress={() => router.push('/(tabs)/jobs')} />
        </Row>
        <Card><Row style={{ justifyContent: 'space-between' }}><Text variant="small">{t('Rating')}</Text><Text variant="label">{p.ratingCount ? `★ ${p.ratingAvg.toFixed(1)} · ${t('{n} reviews', { n: p.ratingCount })}` : '—'}</Text></Row></Card>
        <UsageCard s={plan.data} compact />
      </Screen>
    </View>
  );
}


/** A tile on Home that opens one of the tabs (Jobs / Requests) and says how many things are there. */
function Shortcut({ icon, label, value, alert, alertLabel, onPress }: { icon: string; label: string; value?: number; alert?: number; alertLabel?: string; onPress: () => void }) {
  const th = useTheme();
  const { t } = useT();
  return (
    <Card style={{ flex: 1 }} onPress={onPress}>
      <Row style={{ justifyContent: 'space-between' }}><Text style={{ fontSize: 20, color: th.brand }}>{icon}</Text><Text color={th.brand}>›</Text></Row>
      <Text variant="title">{value ?? '—'}</Text>
      <Text variant="small" numberOfLines={2}>{label}</Text>
      {!!alert && <Badge tone="violet">{alertLabel ? `${alert} ${alertLabel}` : t('{n} need your action', { n: alert })}</Badge>}
    </Card>
  );
}
