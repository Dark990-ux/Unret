'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Building2, GraduationCap, MapPin, ShieldCheck } from 'lucide-react';
import { citiesFor } from '@unret/shared';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { PlanBadge, PromotedLabel } from './plans';
import { money } from '@/lib/format';
import { Avatar, Badge, Card, Select, Stars, cx } from './ui';

export interface CategoryNode { id: string; slug: string; name: string; icon: string | null; remoteAllowed: boolean; requiredVerifications: string[]; children: CategoryNode[] }

const cache: Record<string, CategoryNode[]> = {};

export function useCategories(country = 'RO') {
  const { locale } = useT();
  const key = `${country}:${locale}`;
  const [tree, setTree] = useState<CategoryNode[]>(cache[key] ?? []);
  useEffect(() => {
    if (cache[key]) { setTree(cache[key]); return; }
    api<CategoryNode[]>('/categories', { query: { country, locale } }).then((r) => { cache[key] = r; setTree(r); }).catch(() => undefined);
  }, [key, country, locale]);
  const flat = useMemo(() => tree.flatMap((p) => [p, ...p.children]), [tree]);
  return { tree, flat };
}

export function CategorySelect({ value, onChange, includeParents, placeholder, required, id }: { value: string; onChange: (v: string) => void; includeParents?: boolean; placeholder?: string; required?: boolean; id?: string }) {
  const { tree } = useCategories();
  const { t } = useT();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{placeholder ?? t('Choose a service')}</option>
      {tree.map((p) => (
        <optgroup key={p.id} label={`${p.icon ?? ''} ${p.name}`}>
          {includeParents && <option value={p.slug}>{t('All in {name}', { name: p.name })}</option>}
          {p.children.map((c) => <option key={c.id} value={includeParents ? c.slug : c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

export function CitySelect({ value, onChange, country = 'RO', allowEmpty, id }: { value: string; onChange: (city: string, lat?: number, lng?: number) => void; country?: string; allowEmpty?: boolean; id?: string }) {
  const { t } = useT();
  const cities = citiesFor(country);
  return (
    <Select id={id} value={value} onChange={(e) => { const c = cities.find((x) => x.name === e.target.value); onChange(e.target.value, c?.lat, c?.lng); }}>
      {allowEmpty && <option value="">{t('Any city')}</option>}
      {!allowEmpty && !value && <option value="">{t('Choose a city')}</option>}
      {cities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
    </Select>
  );
}

export interface Badges { identity: boolean; business: boolean; qualifications: { categoryId: string | null; name: string }[]; additional: boolean }

/** Distinguishes types of evidence — a qualification badge is never implied by identity verification. */
export function VerificationBadges({ badges, compact }: { badges: Badges; compact?: boolean }) {
  const { t } = useT();
  const items: React.ReactNode[] = [];
  if (badges.identity) items.push(<Badge key="id" tone="green" icon={<BadgeCheck className="h-3.5 w-3.5" />}>{t('Identity verified')}</Badge>);
  if (badges.business) items.push(<Badge key="biz" tone="blue" icon={<Building2 className="h-3.5 w-3.5" />}>{t('Business verified')}</Badge>);
  for (const q of badges.qualifications)
    items.push(<Badge key={`q${q.categoryId}`} tone="violet" icon={<GraduationCap className="h-3.5 w-3.5" />}>{compact ? t('Qualified') : t('Qualified: {name}', { name: q.name })}</Badge>);
  if (badges.additional) items.push(<Badge key="add" tone="gray" icon={<ShieldCheck className="h-3.5 w-3.5" />}>{t('Additional checks')}</Badge>);
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5">{items}</div>;
}

export function Rating({ avg, count, className }: { avg: number; count: number; className?: string }) {
  const { t } = useT();
  if (!count) return <span className={cx('text-sm text-ink-muted', className)}>{t('No reviews yet')}</span>;
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-sm', className)}>
      <Stars value={avg} />
      <span className="font-medium text-ink dark:text-white">{avg.toFixed(1)}</span>
      <span className="text-ink-muted">({count})</span>
    </span>
  );
}

export interface ProCardData {
  id: string; displayName: string; headline: string | null; avatarUrl: string | null; city: string | null; distanceKm: number | null;
  mainService: string | null; indicativePriceMinor: number | null; pricingType: string | null; currency: string | null;
  ratingAvg: number; ratingCount: number; completedJobs: number; remoteAvailable: boolean; acceptingRequests: boolean;
  availability: 'available' | 'this_week' | 'limited' | 'unknown'; badges: Badges;
  planBadge?: string | null; promoted?: boolean;
}

export function PriceHint({ minor, type, currency }: { minor: number | null; type: string | null; currency: string | null }) {
  const { t, intl } = useT();
  if (minor == null) return <span className="text-sm text-ink-muted">{t('Price on request')}</span>;
  const suffix = type === 'HOURLY' ? t('/hour') : '';
  const prefix = type === 'ESTIMATE' ? t('from') + ' ' : '';
  return <span className="text-sm font-medium text-ink dark:text-white">{prefix}{money(minor, currency ?? 'RON', intl)}{suffix}</span>;
}

export function ProCard({ p }: { p: ProCardData }) {
  const { t } = useT();
  const avail = { available: [t('Available soon'), 'green'], this_week: [t('Available this week'), 'blue'], limited: [t('Limited availability'), 'amber'], unknown: [t('Ask for availability'), 'gray'] } as const;
  const [label, tone] = avail[p.availability];
  return (
    <Link href={`/pros/${p.id}`} className="group block">
      <Card className="flex h-full gap-4 p-4 transition-shadow group-hover:shadow-md sm:p-5">
        <Avatar name={p.displayName} url={p.avatarUrl} size={56} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 truncate font-semibold text-ink group-hover:text-brand-700 dark:text-white">{p.displayName}<PlanBadge badge={p.planBadge} /></h3>
              {p.promoted && <PromotedLabel />}
              <p className="truncate text-sm text-ink-soft dark:text-white/70">{p.mainService}{p.headline ? ` · ${p.headline}` : ''}</p>
            </div>
            <PriceHint minor={p.indicativePriceMinor} type={p.pricingType} currency={p.currency} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <Rating avg={p.ratingAvg} count={p.ratingCount} />
            {p.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.city}{p.distanceKm != null && ` · ${p.distanceKm} km`}</span>}
            {p.completedJobs > 0 && <span>{t('{n} jobs completed', { n: p.completedJobs })}</span>}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Badge tone={tone}>{label}</Badge>
            {p.remoteAvailable && <Badge tone="gray">{t('Remote available')}</Badge>}
            {!p.acceptingRequests && <Badge tone="amber">{t('Not taking new requests')}</Badge>}
          </div>
          <VerificationBadges badges={p.badges} compact />
        </div>
      </Card>
    </Link>
  );
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
