'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SearchX, SlidersHorizontal } from 'lucide-react';
import { CategorySelect, CitySelect, ProCard, ProCardData } from '@/components/domain';
import { Button, Checkbox, Container, Empty, Field, Input, PageLoader, Select } from '@/components/ui-exports';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

function SearchPage() {
  const { t, locale } = useT();
  const sp = useSearchParams();
  const router = useRouter();
  const get = (k: string) => sp.get(k) ?? '';
  const [f, setF] = useState({ category: get('category'), city: get('city'), q: get('q'), minRating: get('minRating'), maxPrice: get('maxPrice'), verified: get('verified'), remote: get('remote'), availableOn: get('availableOn'), sort: get('sort') || 'relevance' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const page = Number(get('page') || 1);

  useEffect(() => {
    setF({ category: get('category'), city: get('city'), q: get('q'), minRating: get('minRating'), maxPrice: get('maxPrice'), verified: get('verified'), remote: get('remote'), availableOn: get('availableOn'), sort: get('sort') || 'relevance' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  const { data, loading } = useApi<{ items: ProCardData[]; total: number; totalPages: number }>('/professionals', {
    category: get('category'), city: get('city'), q: get('q'), minRating: get('minRating'),
    maxPriceMinor: get('maxPrice') ? Math.round(Number(get('maxPrice')) * 100) : undefined,
    verified: get('verified'), remote: get('remote'), availableOn: get('availableOn'), sort: get('sort'), page, pageSize: 12, locale,
  });

  const apply = (e?: React.FormEvent, p = 1) => {
    e?.preventDefault();
    const q = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && !(k === 'sort' && v === 'relevance') && q.set(k, v));
    if (p > 1) q.set('page', String(p));
    router.push(`/search?${q}`);
    setFiltersOpen(false);
  };

  return (
    <Container>
      <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{t('Find professionals')}</h1>
      <form onSubmit={apply} className="mt-5 grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto_auto]">
        <CategorySelect value={f.category} onChange={(v) => setF({ ...f, category: v })} includeParents placeholder={t('All services')} />
        <CitySelect value={f.city} onChange={(c) => setF({ ...f, city: c })} allowEmpty />
        <Input placeholder={t('Name or keyword')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label={t('Name or keyword')} />
        <Button type="button" variant="outline" onClick={() => setFiltersOpen((x) => !x)} aria-expanded={filtersOpen}><SlidersHorizontal className="h-4 w-4" />{t('Filters')}</Button>
        <Button type="submit">{t('Search')}</Button>
      </form>
      {filtersOpen && (
        <div className="mt-3 grid gap-4 rounded-2xl border border-surface-line bg-white p-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-white/10 dark:bg-white/5">
          <Field label={t('Minimum rating')}>
            <Select value={f.minRating} onChange={(e) => setF({ ...f, minRating: e.target.value })}>
              <option value="">{t('Any')}</option>{[4.5, 4, 3.5, 3].map((r) => <option key={r} value={r}>{r}+ ★</option>)}
            </Select>
          </Field>
          <Field label={t('Max. indicative price (RON)')}><Input type="number" min={0} value={f.maxPrice} onChange={(e) => setF({ ...f, maxPrice: e.target.value })} /></Field>
          <Field label={t('Verification')}>
            <Select value={f.verified} onChange={(e) => setF({ ...f, verified: e.target.value })}>
              <option value="">{t('Any')}</option>
              <option value="identity">{t('Identity verified')}</option>
              <option value="business">{t('Business verified')}</option>
              <option value="qualification">{t('Qualification verified')}</option>
            </Select>
          </Field>
          <Field label={t('Available on')}><Input type="date" value={f.availableOn} onChange={(e) => setF({ ...f, availableOn: e.target.value })} /></Field>
          <Field label={t('Sort by')}>
            <Select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
              <option value="relevance">{t('Best match')}</option><option value="rating">{t('Rating')}</option>
              <option value="distance">{t('Distance')}</option><option value="price">{t('Price')}</option>
            </Select>
          </Field>
          <div className="flex items-end pb-2"><Checkbox label={t('Remote service')} checked={f.remote === 'true'} onChange={(e) => setF({ ...f, remote: e.target.checked ? 'true' : '' })} /></div>
        </div>
      )}
      <p className="mt-6 text-sm text-ink-muted">
        {data ? t('{n} professionals found', { n: data.total }) : ' '}
        <span className="ml-2 text-xs">{t('Ranked by relevance, distance, availability, reliability and rating. Professionals with a paid plan are shown higher and marked Promoted.')}</span>
      </p>
      <div className="mt-4">
        {loading ? <PageLoader /> : !data?.items.length ? (
          <Empty icon={<SearchX className="h-8 w-8" />} title={t('No professionals match your search')} text={t('Try a nearby city or broader category, or post a request and let professionals contact you.')} action={<Button href="/requests/new">{t('Post a request')}</Button>} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">{data.items.map((p) => <ProCard key={p.id} p={p} />)}</div>
        )}
      </div>
      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => apply(undefined, page - 1)}>{t('Previous')}</Button>
          <span className="text-sm text-ink-muted">{page} / {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => apply(undefined, page + 1)}>{t('Next')}</Button>
        </div>
      )}
    </Container>
  );
}

export default function Page() {
  return <Suspense fallback={<PageLoader />}><SearchPage /></Suspense>;
}
