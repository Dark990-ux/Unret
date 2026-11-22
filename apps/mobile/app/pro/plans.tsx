import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { PlanBadge, UsageCard } from '@/components/plans';
import { useTheme } from '@/components/theme';
import { Alert, Badge, Button, Card, Loader, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function PlansScreen() {
  const th = useTheme();
  const { t, intl } = useT();
  const plans = useApi<any[]>('/subscriptions/plans');
  const summary = useApi<any>('/subscriptions/summary');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const web = Platform.OS === 'web' && typeof window !== 'undefined';

  // Back from the payment page (web build: query string; phone: app returns to the foreground).
  useEffect(() => {
    const sync = () => api('/subscriptions/sync', { method: 'POST' }).then((s) => summary.setData(s)).catch(() => undefined);
    if (web) {
      const q = new URLSearchParams(window.location.search).get('subscription');
      if (q) { window.history.replaceState(null, '', window.location.pathname); if (q === 'cancelled') setMsg({ tone: 'amber', text: t('Payment cancelled. Your plan did not change.') }); else sync().then(() => setMsg({ tone: 'green', text: t('Payment received. Your new plan is active.') })); }
    }
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') sync(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (plans.loading || summary.loading || !summary.data) return <Loader />;
  const s = summary.data;
  const currentCode = s.plan?.code ?? 'free';
  const currentOrder = plans.data?.find((p) => p.code === currentCode)?.sortOrder ?? 1;
  const sub = s.subscription;
  const choose = async (p: any) => {
    setBusy(p.id); setMsg(null);
    try {
      const r = await api<any>(`/subscriptions/subscribe/${p.id}`, { body: web ? { returnUrl: `${window.location.origin}/pro/plans` } : {} });
      if (r.checkoutUrl) { if (web) window.location.assign(r.checkoutUrl); else await Linking.openURL(r.checkoutUrl); return; }
      summary.setData(r);
      setMsg({ tone: 'green', text: p.priceMinor ? t('You are now on {name}.', { name: t(p.name) }) : t('Your paid plan stays active until {date}, then you move to Free.', { date: date(sub?.currentPeriodEnd, intl) }) });
    } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(null); }
  };
  const act = async (path: string, text: string) => {
    setBusy(path); setMsg(null);
    try { await api(path, { method: 'POST' }); summary.reload(); setMsg({ tone: 'green', text }); } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); } finally { setBusy(null); }
  };

  return (
    <Screen onRefresh={() => { plans.refresh(); summary.refresh(); }} refreshing={summary.refreshing}>
      <Text variant="small">{t('Choose how many new requests you receive each day and how visible you are to customers.')}</Text>
      <UsageCard s={s} />
      {sub?.status === 'PAST_DUE' && <Alert>{t('Your last payment failed. Update your card so you keep your plan.')}</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {(plans.data ?? []).map((p) => {
        const current = p.code === currentCode;
        const f = p.features;
        return (
          <Card key={p.id} style={{ gap: 10, borderWidth: current ? 2 : 1, borderColor: current ? th.brand : th.line, backgroundColor: p.code === 'vip' ? '#fff8e1' : th.card }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={8}><Text variant="h2" color={p.code === 'vip' ? '#1b1a3a' : undefined}>{t(p.name)}</Text>{current ? <Badge tone="green">{t('Current')}</Badge> : <PlanBadge badge={f.badge} />}</Row>
              <Text variant="h2" color={p.code === 'vip' ? '#1b1a3a' : undefined}>{money(p.priceMinor, p.currency, intl)}<Text variant="small"> {t('/month')}</Text></Text>
            </Row>
            {p.code === 'deluxe' && !current && <Text style={{ fontSize: 12, fontWeight: '700', color: '#b45309' }}>★ {t('Most popular')}</Text>}
            <View style={{ backgroundColor: p.code === 'vip' ? '#ffffff' : th.sunk, borderRadius: 10, padding: 8 }}>
              <Text variant="label" color={p.code === 'vip' ? '#1b1a3a' : undefined}>{f.requestsPerDay === null ? `♾️ ${t('Unlimited new requests')}` : `📥 ${t('{n} new requests / day', { n: f.requestsPerDay })}`}</Text>
            </View>
            {(f.highlights ?? []).slice(1).map((h: string) => <Text key={h} variant="small" color={p.code === 'vip' ? '#3d3f66' : undefined}>✓ {t(h)}</Text>)}
            {current ? (
              sub ? (sub.cancelAtPeriodEnd
                ? <><Text variant="small">{t('Ends on {date}', { date: date(sub.currentPeriodEnd, intl) })}</Text><Button small variant="outline" title={t('Keep my plan')} loading={busy === '/subscriptions/resume'} onPress={() => act('/subscriptions/resume', t('Your plan will renew as usual.'))} /></>
                : <><Text variant="small">{t('Renews on {date}', { date: date(sub.currentPeriodEnd, intl) })}</Text><Button small variant="ghost" title={t('Cancel plan')} loading={busy === '/subscriptions/cancel'} onPress={() => act('/subscriptions/cancel', t('Cancelled. Your plan stays active until {date}.', { date: date(sub.currentPeriodEnd, intl) }))} /></>)
                : <Text variant="small">{t('Your current plan')}</Text>
            ) : (
              <Button title={p.priceMinor === 0 ? t('Switch to Free') : p.sortOrder > currentOrder ? t('Upgrade to {name}', { name: t(p.name) }) : t('Switch to {name}', { name: t(p.name) })}
                variant={p.code === 'vip' ? 'sun' : p.priceMinor ? 'primary' : 'outline'} loading={busy === p.id} onPress={() => choose(p)} />
            )}
          </Card>
        );
      })}
      <Text variant="small">{t('Billed monthly. Cancel at any time; your plan stays active until the end of the month you paid for. Changing plans takes effect right away and the price difference is settled on your next invoice.')}</Text>
      <Text variant="small">{t('Paid plans are shown higher in search and matching and are marked “Promoted” for customers. Ranking still depends first on the service, distance, availability and reviews.')}</Text>
      {s.billing === 'simulated' && <Text variant="small">{t('Test mode: no payment provider is connected, so plans start without payment.')}</Text>}
    </Screen>
  );
}
