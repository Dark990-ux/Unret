'use client';

import { Check } from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader, PageLoader } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Plans /></ProShell>;
}

function Plans() {
  const { t, intl } = useT();
  const plans = useApi<any[]>('/subscriptions/plans');
  const current = useApi<any>('/subscriptions/current');
  if (plans.loading || current.loading) return <PageLoader />;
  const featureLabels: Record<string, string> = { teamSeats: 'Team seats', analytics: 'Performance analytics', portfolioItems: 'Portfolio items', sharedCalendar: 'Shared team calendar' };
  return (
    <>
      <PageHeader title={t('Plans')} />
      <div className="mb-6"><Alert tone="blue">{t('Plans unlock tools for your business. They never change your position in search or matching — ranking is based on relevance, location, availability, reliability and rating.')}</Alert></div>
      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p) => {
          const active = current.data?.planId === p.id;
          return (
            <Card key={p.id} className={`flex flex-col p-5 ${active ? 'ring-2 ring-brand-600' : ''}`}>
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-ink dark:text-white">{p.name}</h2>{active && <Badge tone="green">{t('Current')}</Badge>}</div>
              <div className="mt-2 text-3xl font-semibold">{p.priceMinor ? money(p.priceMinor, p.currency, intl) : t('Free')}<span className="text-sm font-normal text-ink-muted">{p.priceMinor ? t('/month') : ''}</span></div>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {Object.entries(p.features as Record<string, unknown>).filter(([, v]) => v).map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2"><Check className="h-4 w-4 text-brand-600" />{t(featureLabels[k] ?? k)}{typeof v === 'number' ? `: ${v}` : ''}</li>
                ))}
              </ul>
              {active ? (
                <div className="mt-4 text-sm text-ink-muted">{t('Renews on {date}', { date: date(current.data.currentPeriodEnd, intl) })}<Button variant="ghost" size="sm" className="ml-2" onClick={async () => { await api('/subscriptions/cancel', { method: 'POST' }); current.reload(); }}>{t('Cancel')}</Button></div>
              ) : <Button className="mt-4" variant={p.priceMinor ? 'primary' : 'outline'} onClick={async () => { await api(`/subscriptions/subscribe/${p.id}`, { method: 'POST' }); current.reload(); }}>{t('Choose {name}', { name: p.name })}</Button>}
            </Card>
          );
        })}
      </div>
    </>
  );
}
