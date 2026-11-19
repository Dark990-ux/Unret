'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Clock, Flag, Heart, Languages, MapPin, MessageSquare, Briefcase, Wifi, Zap } from 'lucide-react';
import { PriceHint, Rating, VerificationBadges, WEEKDAYS, Badges } from '@/components/domain';
import { ReportButton } from '@/components/report';
import { Avatar, Badge, Button, Card, Container, Empty, PageLoader, Stars } from '@/components/ui-exports';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, responseTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

interface Profile {
  id: string; displayName: string; accountType: string; headline: string | null; biography: string | null; experienceYears: number | null;
  languages: string[]; city: string | null; serviceRadiusKm: number; remoteAvailable: boolean; emergencyAvailable: boolean; acceptingRequests: boolean;
  avatarUrl: string | null; company: { displayName: string } | null;
  services: { categoryId: string; categorySlug: string; categoryName: string; description: string | null; pricingType: string; indicativePriceMinor: number | null; currency: string; isPrimary: boolean }[];
  portfolio: { id: string; title: string; description: string | null; url: string }[];
  workingHours: { weekday: number; startTime: string; endTime: string }[];
  badges: Badges;
  stats: { ratingAvg: number; ratingCount: number; completedJobs: number; avgResponseMinutes: number | null; communication: number | null; quality: number | null; punctuality: number | null; memberSince: string };
  reviews: { id: string; overall: number; text: string | null; isVerifiedJob: boolean; createdAt: string; customerName: string; professionalResponse: string | null; serviceName: string }[];
  saved: boolean; visibility?: string;
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale, intl } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const { data: p, loading, error, setData } = useApi<Profile>(`/professionals/${id}`, { locale });
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (error || !p) return <Container><Empty title={t('Professional not found')} /></Container>;

  const contact = async () => {
    if (!me) return router.push(`/login?next=/pros/${id}`);
    setBusy(true);
    try {
      const c = await api('/conversations', { body: { professionalId: id } });
      router.push(`/messages/${c.id}`);
    } finally {
      setBusy(false);
    }
  };
  const toggleSave = async () => {
    if (!me) return router.push(`/login?next=/pros/${id}`);
    await api(`/users/me/saved/${id}`, { method: p.saved ? 'DELETE' : 'POST' });
    setData({ ...p, saved: !p.saved });
  };
  const primary = p.services.find((s) => s.isPrimary) ?? p.services[0];
  const hoursByDay = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, slots: p.workingHours.filter((h) => h.weekday === d) }));

  return (
    <Container>
      {p.visibility && p.visibility !== 'PUBLIC' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {t('This is a preview. Your profile is not yet listed in search — complete it from your professional dashboard.')}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row">
              <Avatar name={p.displayName} url={p.avatarUrl} size={96} />
              <div className="min-w-0 flex-1 space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{p.displayName}</h1>
                {p.headline && <p className="text-ink-soft dark:text-white/70">{p.headline}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                  <Rating avg={p.stats.ratingAvg} count={p.stats.ratingCount} />
                  {p.city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{p.city} · {t('up to {n} km', { n: p.serviceRadiusKm })}</span>}
                  {p.experienceYears != null && <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{t('{n} years experience', { n: p.experienceYears })}</span>}
                </div>
                <VerificationBadges badges={p.badges} />
                <div className="flex flex-wrap gap-1.5">
                  {p.remoteAvailable && <Badge icon={<Wifi className="h-3.5 w-3.5" />}>{t('Remote available')}</Badge>}
                  {p.emergencyAvailable && <Badge tone="amber" icon={<Zap className="h-3.5 w-3.5" />}>{t('Emergency availability')}</Badge>}
                  {p.company && <Badge tone="blue">{p.company.displayName}</Badge>}
                </div>
              </div>
            </div>
          </Card>

          {p.biography && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-2 font-semibold text-ink dark:text-white">{t('About')}</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft dark:text-white/75">{p.biography}</p>
              {p.languages.length > 0 && <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted"><Languages className="h-4 w-4" />{p.languages.map((l) => l.toUpperCase()).join(', ')}</p>}
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Services')}</h2>
            <ul className="divide-y divide-surface-line dark:divide-white/10">
              {p.services.map((s) => (
                <li key={s.categoryId} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-ink dark:text-white">{s.categoryName}</div>
                    {s.description && <div className="text-sm text-ink-muted">{s.description}</div>}
                  </div>
                  <PriceHint minor={s.indicativePriceMinor} type={s.pricingType} currency={s.currency} />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">{t('Indicative prices. The final price is agreed in the offer for your specific request.')}</p>
          </Card>

          {p.portfolio.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Portfolio')}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {p.portfolio.map((i) => (
                  <figure key={i.id} className="overflow-hidden rounded-xl bg-surface-sunk">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.url} alt={i.title} className="aspect-square w-full object-cover" loading="lazy" />
                    <figcaption className="px-2 py-1.5 text-xs text-ink-soft dark:text-white/70">{i.title}</figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink dark:text-white">{t('Reviews')}</h2>
              <span className="text-xs text-ink-muted">{t('Only customers with a completed job can leave a verified review.')}</span>
            </div>
            {p.stats.ratingCount > 0 && (
              <div className="mb-5 grid grid-cols-3 gap-3 rounded-xl bg-surface-sunk p-3 text-center text-sm dark:bg-white/5">
                {[[t('Communication'), p.stats.communication], [t('Quality'), p.stats.quality], [t('Punctuality'), p.stats.punctuality]].map(([l, v]) => (
                  <div key={l as string}><div className="font-semibold text-ink dark:text-white">{v ? (v as number).toFixed(1) : '—'}</div><div className="text-xs text-ink-muted">{l as string}</div></div>
                ))}
              </div>
            )}
            {p.reviews.length === 0 ? <p className="text-sm text-ink-muted">{t('No reviews yet')}</p> : (
              <ul className="space-y-5">
                {p.reviews.map((r) => (
                  <li key={r.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Stars value={r.overall} />
                      <span className="font-medium text-ink dark:text-white">{r.customerName}</span>
                      <span className="text-ink-muted">· {r.serviceName} · {date(r.createdAt, intl)}</span>
                      {r.isVerifiedJob && <Badge tone="green">{t('Verified job')}</Badge>}
                    </div>
                    {r.text && <p className="text-sm text-ink-soft dark:text-white/75">{r.text}</p>}
                    {r.professionalResponse && (
                      <div className="ml-4 border-l-2 border-brand-200 pl-3 text-sm text-ink-soft dark:border-brand-800 dark:text-white/70">
                        <span className="font-medium">{t('Response from {name}', { name: p.displayName })}: </span>{r.professionalResponse}
                      </div>
                    )}
                    {me && <ReportButton targetType="REVIEW" targetId={r.id} small />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-4 p-5">
            {primary && <div><div className="text-sm text-ink-muted">{primary.categoryName}</div><PriceHint minor={primary.indicativePriceMinor} type={primary.pricingType} currency={primary.currency} /></div>}
            {!p.acceptingRequests && <Badge tone="amber">{t('Not taking new requests at the moment')}</Badge>}
            <Button className="w-full" href={me ? `/requests/new?category=${primary?.categoryId ?? ''}&pro=${p.id}` : `/register?next=/requests/new`}>{t('Request a quote')}</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={contact} loading={busy}><MessageSquare className="h-4 w-4" />{t('Message')}</Button>
              <Button variant="outline" onClick={toggleSave} aria-pressed={p.saved}><Heart className={p.saved ? 'h-4 w-4 fill-red-500 text-red-500' : 'h-4 w-4'} />{p.saved ? t('Saved') : t('Save')}</Button>
            </div>
            <dl className="space-y-2 border-t border-surface-line pt-4 text-sm dark:border-white/10">
              <div className="flex justify-between"><dt className="text-ink-muted">{t('Jobs completed on UNRET')}</dt><dd className="font-medium">{p.stats.completedJobs}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">{t('Average response time')}</dt><dd className="font-medium">{responseTime(p.stats.avgResponseMinutes) ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">{t('Member since')}</dt><dd className="font-medium">{date(p.stats.memberSince, intl)}</dd></div>
            </dl>
          </Card>
          {p.workingHours.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink dark:text-white"><Clock className="h-4 w-4" />{t('Working hours')}</h2>
              <ul className="space-y-1 text-sm">
                {hoursByDay.map(({ d, slots }) => (
                  <li key={d} className="flex justify-between"><span className="text-ink-muted">{t(WEEKDAYS[d])}</span><span className="tabular-nums">{slots.length ? slots.map((s) => `${s.startTime}–${s.endTime}`).join(', ') : t('Closed')}</span></li>
                ))}
              </ul>
            </Card>
          )}
          {me && <div className="text-center"><ReportButton targetType="PROFILE" targetId={p.id} /></div>}
        </aside>
      </div>
    </Container>
  );
}
