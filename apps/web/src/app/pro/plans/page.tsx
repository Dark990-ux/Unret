'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Alert, Badge, Button, Card, PageHeader, PageLoader, cx } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { PlanBadge, UsageCard } from '@/components/plans';
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
  const summary = useApi<any>('/subscriptions/summary');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'blue' | 'amber'; text: string } | null>(null);

  // Back from the payment page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('subscription');
    if (!q) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (q === 'cancelled') setMsg({ tone: 'amber', text: t('Payment cancelled. Your plan did not change.') });
    else api('/subscriptions/sync', { method: 'POST' }).then((s) => { summary.setData(s); setMsg({ tone: 'green', text: t('Payment received. Your new plan is active.') }); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (plans.loading || summary.loading || !summary.data) return <PageLoader />;
  const s = summary.data;
  const currentCode = s.plan?.code ?? 'free';
  const currentOrder = plans.data?.find((p) => p.code === currentCode)?.sortOrder ?? 1;
  const sub = s.subscription;

  const choose = async (p: any) => {
    setBusy(p.id); setMsg(null);
    try {
      const r = await api<any>(`/subscriptions/subscribe/${p.id}`, { body: { returnUrl: `${window.location.origin}/pro/plans` } });
      if (r.checkoutUrl) { window.location.assign(r.checkoutUrl); return; }
      summary.setData(r);
      setMsg({ tone: 'green', text: p.priceMinor ? t('You are now on {name}.', { name: p.name }) : t('Your paid plan stays active until {date}, then you move to Free.', { date: date(sub?.currentPeriodEnd, intl) }) });
    } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(null); }
  };
  const act = async (path: string, text: string) => {
    setBusy(path); setMsg(null);
    try { await api(path, { method: 'POST' }); summary.reload(); setMsg({ tone: 'green', text }); } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title={t('Plans')} subtitle={t('Choose how many new requests you receive each day and how visible you are to customers.')} />
      <div className="mb-6"><UsageCard s={s} /></div>
      {sub?.status === 'PAST_DUE' && <div className="mb-4"><Alert>{t('Your last payment failed. Update your card so you keep your plan.')}</Alert></div>}
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(plans.data ?? []).map((p) => {
          const current = p.code === currentCode;
          const f = p.features;
          const popular = p.code === 'deluxe';
          return (
            <Card key={p.id} data-testid={`plan-${p.code}`} className={cx('relative flex flex-col p-5', current && 'ring-2 ring-brand-600', p.code === 'vip' && 'bg-gradient-to-b from-accent-100/60 to-white dark:from-accent-500/10 dark:to-transparent')}>
              {popular && !current && <span className="absolute -top-2.5 right-4 rounded-full bg-accent-500 px-2.5 py-0.5 text-xs font-semibold text-accent-ink">{t('Most popular')}</span>}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-ink dark:text-white">{t(p.name)}</h2>
                {current ? <Badge tone="green">{t('Current')}</Badge> : <PlanBadge badge={f.badge} />}
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold tabular-nums text-ink dark:text-white">{p.priceMinor ? money(p.priceMinor, p.currency, intl) : money(0, p.currency, intl)}</span>
                <span className="text-sm text-ink-muted"> {t('/month')}</span>
              </div>
              <div className="mt-3 rounded-xl bg-surface-sunk px-3 py-2 text-sm font-semibold text-ink dark:bg-white/5 dark:text-white">
                {f.requestsPerDay === null ? `♾️ ${t('Unlimited new requests')}` : `📥 ${t('{n} new requests / day', { n: f.requestsPerDay })}`}
              </div>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-ink-soft dark:text-white/75">
                {(f.highlights ?? []).slice(1).map((h: string) => <li key={h} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{t(h)}</li>)}
              </ul>
              <div className="mt-4">
                {current ? (
                  sub ? (
                    sub.cancelAtPeriodEnd
                      ? <div className="space-y-2 text-sm text-ink-muted">{t('Ends on {date}', { date: date(sub.currentPeriodEnd, intl) })}<Button size="sm" variant="outline" className="w-full" loading={busy === '/subscriptions/resume'} onClick={() => act('/subscriptions/resume', t('Your plan will renew as usual.'))}>{t('Keep my plan')}</Button></div>
                      : <div className="space-y-2 text-sm text-ink-muted">{t('Renews on {date}', { date: date(sub.currentPeriodEnd, intl) })}<Button size="sm" variant="ghost" className="w-full" loading={busy === '/subscriptions/cancel'} onClick={() => act('/subscriptions/cancel', t('Cancelled. Your plan stays active until {date}.', { date: date(sub.currentPeriodEnd, intl) }))}>{t('Cancel plan')}</Button></div>
                  ) : <div className="text-sm text-ink-muted">{t('Your current plan')}</div>
                ) : (
                  <Button className={cx('w-full', p.code === 'vip' && '!bg-accent-500 !text-accent-ink hover:!bg-accent-400')} variant={p.priceMinor ? 'primary' : 'outline'} loading={busy === p.id} onClick={() => choose(p)}>
                    {p.priceMinor === 0 ? t('Switch to Free') : p.sortOrder > currentOrder ? t('Upgrade to {name}', { name: t(p.name) }) : t('Switch to {name}', { name: t(p.name) })}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="mt-6 space-y-1 text-xs text-ink-muted">
        <p>{t('Billed monthly. Cancel at any time; your plan stays active until the end of the month you paid for. Changing plans takes effect right away and the price difference is settled on your next invoice.')}</p>
        <p>{t('Paid plans are shown higher in search and matching and are marked “Promoted” for customers. Ranking still depends first on the service, distance, availability and reviews.')}</p>
        {s.billing === 'simulated' && <p>{t('Test mode: no payment provider is connected, so plans start without payment.')}</p>}
      </div>
    </>
  );
}
