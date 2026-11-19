'use client';

import { useState } from 'react';
import { Card, PageHeader, PageLoader, Select, Stat } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Analytics /></AdminShell>;
}

function Analytics() {
  const { t, intl } = useT();
  const [days, setDays] = useState('30');
  const { data: a, loading } = useApi<any>('/admin/analytics', { days });
  const pct = (v: number | null) => (v == null ? '—' : `${v}%`);
  return (
    <>
      <PageHeader title={t('Platform analytics')} actions={<Select value={days} onChange={(e) => setDays(e.target.value)} aria-label={t('Period')}><option value="7">{t('Last 7 days')}</option><option value="30">{t('Last 30 days')}</option><option value="90">{t('Last 90 days')}</option><option value="365">{t('Last year')}</option></Select>} />
      {loading || !a ? <PageLoader /> : (
        <div className="space-y-6">
          <Card className="bg-brand-800 p-6 text-white dark:bg-brand-900">
            <div className="text-sm text-brand-100">{t('Key metric')}: {t(a.headline.label)}</div>
            <div className="mt-1 text-5xl font-semibold tabular-nums">{pct(a.headline.requestToCompletedJobRate)}</div>
            <div className="mt-1 text-sm text-brand-100">{t('{c} completed jobs from {p} published requests', { c: a.funnel.completedJobs, p: a.funnel.publishedRequests })}</div>
          </Card>
          <section>
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Marketplace funnel')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={t('Published requests')} value={a.funnel.publishedRequests} />
              <Stat label={t('With ≥1 offer')} value={pct(a.funnel.requestsWithOneOfferRate)} hint={a.funnel.requestsWithOneOffer} />
              <Stat label={t('With ≥2 offers')} value={pct(a.funnel.requestsWithTwoOffersRate)} hint={a.funnel.requestsWithTwoOffers} />
              <Stat label={t('Avg. time to first offer')} value={a.funnel.avgMinutesToFirstOffer == null ? '—' : `${a.funnel.avgMinutesToFirstOffer} min`} />
              <Stat label={t('Offer acceptance rate')} value={pct(a.funnel.offerAcceptanceRate)} />
              <Stat label={t('Completed jobs')} value={a.funnel.completedJobs} />
              <Stat label={t('Cancellation rate')} value={pct(a.quality.cancellationRate)} />
              <Stat label={t('Dispute rate')} value={pct(a.quality.disputeRate)} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Supply and demand')}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={t('Registered professionals')} value={a.supply.registeredProfessionals} />
              <Stat label={t('Active professionals (30d)')} value={a.supply.activeProfessionals30d} />
              <Stat label={t('Professional retention')} value={pct(a.supply.professionalRetention)} hint={t('Active in last 30d, joined >60d ago')} />
              <Stat label={t('Active customers (30d)')} value={a.demand.activeCustomers30d} />
              <Stat label={t('Repeat customers')} value={a.demand.repeatCustomers} />
              <Stat label={t('Active users')} value={a.demand.totalActiveUsers} />
              {a.revenue.map((r: any) => <Stat key={r.currency} label={t('Online volume ({cur})', { cur: r.currency })} value={money(r._sum.grossMinor, r.currency, intl)} hint={`${t('Fees')}: ${money(r._sum.platformFeeMinor, r.currency, intl)}`} />)}
            </div>
          </section>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Top categories by requests')}</h2>
            {!a.topCategories.length ? <p className="text-sm text-ink-muted">{t('No data yet.')}</p> : (
              <ul className="space-y-2">
                {a.topCategories.map((c: any) => {
                  const max = a.topCategories[0].requests;
                  return (
                    <li key={c.categoryId} className="grid grid-cols-[160px_1fr_40px] items-center gap-3 text-sm">
                      <span className="truncate">{c.name}</span>
                      <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunk dark:bg-white/10"><div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.requests / max) * 100}%` }} /></div>
                      <span className="text-right tabular-nums">{c.requests}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
