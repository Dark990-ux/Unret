import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, View } from 'react-native';
import { AvailabilityCalendar } from '@/components/calendar';
import { PriceHint, Rating, VerificationBadges } from '@/components/domain';
import { Avatar, Badge, Button, Card, Empty, Loader, Row, Screen, Section, Stars, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { date } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, intl } = useT();
  const { data: p, loading, setData, error } = useApi<any>(`/professionals/${id}`, { locale });
  if (loading) return <Loader />;
  if (!p) return <Screen><Empty title={error ?? t('Professional not found')} /></Screen>;
  const primary = p.services.find((s: any) => s.isPrimary) ?? p.services[0];
  const message = async () => { const c = await api('/conversations', { body: { professionalId: id } }); router.push(`/messages/${c.id}`); };
  const toggleSave = async () => { await api(`/users/me/saved/${id}`, { method: p.saved ? 'DELETE' : 'POST' }); setData({ ...p, saved: !p.saved }); };
  return (
    <Screen>
      <Stack.Screen options={{ title: p.displayName }} />
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={p.displayName} url={absUrl(p.avatarUrl)} size={88} />
        <Text variant="title" style={{ textAlign: 'center' }}>{p.displayName}</Text>
        {p.headline && <Text variant="small" style={{ textAlign: 'center' }}>{p.headline}</Text>}
        <Rating avg={p.stats.ratingAvg} count={p.stats.ratingCount} />
        <Text variant="small">📍 {p.city} · {t('up to {n} km', { n: p.serviceRadiusKm })}{p.experienceYears != null ? ` · ${t('{n} years experience', { n: p.experienceYears })}` : ''}</Text>
        <VerificationBadges badges={p.badges} />
        <Row gap={6}>{p.remoteAvailable && <Badge>{t('Remote available')}</Badge>}{p.emergencyAvailable && <Badge tone="amber">{t('Emergency availability')}</Badge>}{!p.acceptingRequests && <Badge tone="amber">{t('Not taking new requests at the moment')}</Badge>}</Row>
      </Card>
      <Button title={t('Request a quote')} onPress={() => router.push({ pathname: '/requests/new', params: { category: primary?.categoryId ?? '' } })} />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button title={t('Message')} variant="outline" onPress={message} style={{ flex: 1 }} />
        <Button title={p.saved ? `♥ ${t('Saved')}` : `♡ ${t('Save')}`} variant="outline" onPress={toggleSave} style={{ flex: 1 }} />
      </Row>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Card style={{ flex: 1 }}><Text variant="small">{t('Jobs completed on UNRET')}</Text><Text variant="h2">{p.stats.completedJobs}</Text></Card>
        <Card style={{ flex: 1 }}><Text variant="small">{t('Member since')}</Text><Text variant="h2">{date(p.stats.memberSince, intl)}</Text></Card>
      </Row>
      {p.biography && <Section title={t('About')}><Card><Text style={{ lineHeight: 22 }}>{p.biography}</Text></Card></Section>}
      <Section title={t('Services')}>
        <Card>
          {p.services.map((s: any) => (
            <View key={s.categoryId} style={{ paddingVertical: 4 }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Text variant="label" style={{ flex: 1 }}>{s.categoryName}</Text><PriceHint minor={s.indicativePriceMinor} type={s.pricingType} currency={s.currency} /></Row>
              {s.description && <Text variant="small">{s.description}</Text>}
            </View>
          ))}
          <Text variant="small">{t('Indicative prices. The final price is agreed in the offer for your specific request.')}</Text>
        </Card>
      </Section>
      {p.portfolio.length > 0 && (
        <Section title={t('Portfolio')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {p.portfolio.map((i: any) => <View key={i.id} style={{ width: 160, gap: 4 }}><Image source={{ uri: absUrl(i.url)! }} style={{ width: 160, height: 160, borderRadius: 12 }} accessibilityLabel={i.title} /><Text variant="small" numberOfLines={1}>{i.title}</Text></View>)}
          </ScrollView>
        </Section>
      )}
      <Section title={t('Availability')}>
        <Card>
          <AvailabilityCalendar professionalId={p.id} professionalName={p.displayName} acceptingRequests={p.acceptingRequests}
            services={p.services.map((s: any) => ({ categoryId: s.categoryId, categoryName: s.categoryName }))} />
        </Card>
      </Section>
      {p.workingHours.length > 0 && (
        <Section title={t('Working hours')}>
          <Card>{[1, 2, 3, 4, 5, 6, 0].map((d) => { const sl = p.workingHours.filter((h: any) => h.weekday === d); return <Row key={d} style={{ justifyContent: 'space-between' }}><Text variant="small">{t(DAYS[d])}</Text><Text>{sl.length ? sl.map((s: any) => `${s.startTime}–${s.endTime}`).join(', ') : t('Closed')}</Text></Row>; })}</Card>
        </Section>
      )}
      <Section title={`${t('Reviews')} (${p.stats.ratingCount})`}>
        <Text variant="small">{t('Only customers with a completed job can leave a verified review.')}</Text>
        {p.reviews.map((r: any) => (
          <Card key={r.id}>
            <Row><Stars value={r.overall} /><Text variant="label">{r.customerName}</Text>{r.isVerifiedJob && <Badge tone="green">{t('Verified job')}</Badge>}</Row>
            <Text variant="small">{r.serviceName} · {date(r.createdAt, intl)}</Text>
            {r.text && <Text>{r.text}</Text>}
            {r.professionalResponse && <Text variant="small">↳ {r.professionalResponse}</Text>}
          </Card>
        ))}
      </Section>
    </Screen>
  );
}
