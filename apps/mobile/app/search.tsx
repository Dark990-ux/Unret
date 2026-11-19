import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { CategorySelect, CitySelect, ProCard } from '@/components/domain';
import { Button, Empty, Input, Loader, Row, Screen, Segmented, Text } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Search() {
  const { t, locale } = useT();
  const params = useLocalSearchParams<{ category?: string; saved?: string }>();
  const [f, setF] = useState({ category: params.category ?? '', city: '', q: '', sort: 'relevance', verified: '' });
  const [query, setQuery] = useState(f);
  const saved = params.saved === '1';
  const res = useApi<{ items: any[]; total: number }>(saved ? null : '/professionals', { ...query, pageSize: 30, locale });
  const savedList = useApi<any[]>(saved ? '/users/me/saved' : null);

  if (saved) {
    return (
      <Screen onRefresh={savedList.refresh} refreshing={savedList.refreshing}>
        <Text variant="title">{t('Saved professionals')}</Text>
        {savedList.loading ? <Loader /> : !savedList.data?.length ? <Empty title={t('No saved professionals')} text={t('Tap “Save” on a profile to keep it here.')} /> :
          savedList.data.map((p) => <ProCard key={p.professionalId} p={{ ...p, id: p.professionalId, displayName: p.name, badges: { identity: false, business: false, qualifications: [], additional: false } }} onPress={() => router.push(`/pros/${p.professionalId}`)} />)}
      </Screen>
    );
  }
  return (
    <Screen onRefresh={res.refresh} refreshing={res.refreshing}>
      <CategorySelect value={f.category} onChange={(category) => { const n = { ...f, category }; setF(n); setQuery(n); }} bySlug placeholder={t('All services')} />
      <CitySelect value={f.city} onChange={(city) => { const n = { ...f, city }; setF(n); setQuery(n); }} allowEmpty />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Input value={f.q} onChangeText={(q) => setF({ ...f, q })} placeholder={t('Name or keyword')} style={{ flex: 1 }} returnKeyType="search" onSubmitEditing={() => setQuery(f)} accessibilityLabel={t('Name or keyword')} />
        <Button title={t('Search')} onPress={() => setQuery(f)} />
      </Row>
      <Segmented value={f.sort} onChange={(sort) => { const n = { ...f, sort }; setF(n); setQuery(n); }}
        items={[{ value: 'relevance', label: t('Best match') }, { value: 'rating', label: t('Rating') }, { value: 'distance', label: t('Distance') }, { value: 'price', label: t('Price') }]} />
      <Segmented value={f.verified} onChange={(verified) => { const n = { ...f, verified }; setF(n); setQuery(n); }}
        items={[{ value: '', label: t('Any') }, { value: 'identity', label: t('Identity verified') }, { value: 'qualification', label: t('Qualification verified') }]} />
      <Text variant="small">{res.data ? t('{n} professionals found', { n: res.data.total }) : ' '} · {t('Ranked by relevance, distance, availability, reliability and rating — never by paid placement.')}</Text>
      {res.loading ? <Loader /> : !res.data?.items.length ? (
        <Empty title={t('No professionals match your search')} text={t('Try a nearby city or broader category, or post a request and let professionals contact you.')} action={<Button title={t('Post a request')} onPress={() => router.push('/requests/new')} />} />
      ) : res.data.items.map((p) => <ProCard key={p.id} p={p} onPress={() => router.push(`/pros/${p.id}`)} />)}
    </Screen>
  );
}
