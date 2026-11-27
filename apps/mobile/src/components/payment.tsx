import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, View } from 'react-native';
import { useTheme } from './theme';
import { Alert, Badge, Button, Card, Field, Input, Row, Text, Tone } from './ui';
import { api } from '@/lib/api';
import { dateTime, majorToMinor, money } from '@/lib/format';
import { useT } from '@/lib/i18n';

export type Method = 'TRANSFER' | 'CASH' | 'PLATFORM';
export const METHODS: { value: Method; icon: string; title: string; text: string }[] = [
  { value: 'TRANSFER', icon: '💳', title: 'Card / bank transfer', text: 'You pay the professional directly. They confirm in the app when the money arrives.' },
  { value: 'CASH', icon: '💵', title: 'Cash', text: 'You pay face to face. The professional confirms in the app when they receive it.' },
  { value: 'PLATFORM', icon: '✦', title: 'Through UNRET', text: 'Pay by card in the app. UNRET keeps the money safe and sends it to the professional when the job is done.' },
];
export const methodLabel = (m: string | null | undefined) => (m === 'CASH' ? 'Cash' : m === 'PLATFORM' ? 'Through UNRET' : m === 'TRANSFER' ? 'Card / bank transfer' : m === 'DIRECT' ? 'Direct payment' : '—');
export const methodIcon = (m: string | null | undefined) => (m === 'CASH' ? '💵' : m === 'PLATFORM' ? '✦' : '💳');

/** Three payment options shown as selectable cards. */
export function PaymentMethodPicker({ value, onChange }: { value: Method | null; onChange: (m: Method) => void }) {
  const th = useTheme();
  const { t } = useT();
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={t('How will you pay?')}>
      {METHODS.map((m) => {
        const on = value === m.value;
        return (
          <Pressable key={m.value} onPress={() => onChange(m.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t(m.title)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? th.brand : th.line, backgroundColor: on ? th.brandSoft : th.card }}>
            <Text style={{ fontSize: 20 }}>{m.icon}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" color={on ? th.brandDark : th.text}>{t(m.title)}</Text>
              <Text variant="small">{t(m.text)}</Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? th.brand : th.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.brand }} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const STATE: Record<string, [string, Tone]> = {
  unpaid: ['Not paid yet', 'amber'], awaiting_confirmation: ['Waiting for confirmation', 'blue'], deposit_paid: ['Deposit paid', 'blue'], partly_paid: ['Partly paid', 'blue'], paid: ['Paid', 'green'],
  processing: ['Payment in progress', 'blue'], held: ['Paid, held by UNRET', 'violet'], paid_out: ['Sent to the professional', 'green'], refunded: ['Refunded', 'gray'],
};
export function PaymentStateBadge({ state }: { state: string }) {
  const { t } = useT();
  const [l, tone] = STATE[state] ?? [state, 'gray' as Tone];
  return <Badge tone={tone}>{t(l)}</Badge>;
}

export const DEPOSIT_OPTIONS = [10, 20, 30, 40, 50];
export const formatIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

/** Offer form: ask for a deposit (10–50% of the price) before starting the work. */
export function DepositPicker({ value, note, price, currency, onChange }: { value: string; note: string; price: string; currency: string; onChange: (percent: string, note: string) => void }) {
  const th = useTheme();
  const { t, intl } = useT();
  const amount = value && Number(price) > 0 ? money(Math.round(((majorToMinor(price) ?? 0) * Number(value)) / 100), currency, intl) : null;
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: th.line, borderRadius: 12, padding: 12 }}>
      <Text variant="label">{t('Deposit before starting')}</Text>
      <Row gap={6}>
        {['', ...DEPOSIT_OPTIONS.map(String)].map((v) => {
          const on = value === v;
          return (
            <Pressable key={v || 'none'} onPress={() => onChange(v, note)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? th.brand : th.line, backgroundColor: on ? th.brand : 'transparent' }}>
              <Text variant="small" color={on ? th.onBrand : th.text}>{v ? `${v}%` : t('No deposit')}</Text>
            </Pressable>
          );
        })}
      </Row>
      {value ? (
        <>
          <Text variant="small">{amount ? t('The customer pays {amount} before you start; the rest when the job is done.', { amount }) : t('The customer pays this part before you start; the rest when the job is done.')}</Text>
          <Input value={note} onChangeText={(n) => onChange(value, n)} maxLength={300} placeholder={t('What the deposit covers, e.g. materials')} accessibilityLabel={t('What the deposit covers')} />
        </>
      ) : <Text variant="small">{t('The customer pays everything at the end, or as agreed.')}</Text>}
    </View>
  );
}

export function DepositLine({ priceMinor, percent, note, currency }: { priceMinor: number; percent?: number | null; note?: string | null; currency: string }) {
  const { t, intl } = useT();
  if (!percent) return null;
  return <Text variant="small">💰 {t('Deposit: {amount} ({pct}%) before starting', { amount: money(Math.round((priceMinor * percent) / 100), currency, intl), pct: percent })}{note ? ` · ${note}` : ''}</Text>;
}

/** Payment panel on the job page: amounts, what happens next for this method, and the right button. */
export function PaymentPanel({ job, onUpdated }: { job: any; onUpdated: (j: any) => void }) {
  const th = useTheme();
  const { t, intl } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [checkout, setCheckout] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const can = (a: string) => job.allowedActions.includes(a);
  const isCustomer = job.viewerRole === 'customer';
  const cur = job.currency;
  const m = (v: number) => money(v, cur, intl);
  const s = job.payment ?? { totalMinor: job.agreedPriceMinor, depositMinor: job.depositMinor ?? 0, paidMinor: 0, remainingMinor: job.agreedPriceMinor, depositPaid: false };
  const deposit = s.depositMinor > 0;
  const depositDue = deposit && s.paidMinor === 0;
  const awaitingPay = job.payments.find((p: any) => p.status === 'AWAITING_CONFIRMATION');
  const [amount, setAmount] = useState(String((awaitingPay?.grossMinor ?? (depositDue ? s.depositMinor : s.remainingMinor)) / 100));
  const pro = job.professional.displayName;
  const state: string = job.paymentState ?? 'unpaid';
  const live = job.payments.filter((p: any) => p.status !== 'FAILED');
  const platformPaid = live.filter((p: any) => p.method === 'PLATFORM' && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status));
  const heldPayout = platformPaid.filter((p: any) => p.payoutStatus === 'HELD').reduce((a: number, p: any) => a + p.payoutMinor, 0);
  const lastPayout = platformPaid.map((p: any) => p.payoutAt).filter(Boolean).sort().pop();
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(null); try { const r = await fn(); if (r?.id && r.allowedActions) onUpdated(r); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const reload = async () => onUpdated(await api(`/jobs/${job.id}`));
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const pay = (part?: string) => run(async () => {
    // On the web build the payment page returns to this screen; the native app gets the result when it comes back to the foreground.
    const r = await api<any>(`/payments/jobs/${job.id}/checkout`, { body: { ...(part ? { part } : {}), ...(web ? { returnUrl: `${window.location.origin}/jobs/${job.id}` } : {}) } });
    if (r.checkoutUrl) { if (web) window.location.assign(r.checkoutUrl); else await Linking.openURL(r.checkoutUrl); }
    else setCheckout(r); // development provider: simulate below
  });
  const [returned, setReturned] = useState<string | null>(null);
  const pendingId = live.find((p: any) => p.method === 'PLATFORM' && p.status === 'PENDING' && p.provider !== 'mock')?.id;
  useEffect(() => {
    const q = web ? new URLSearchParams(window.location.search).get('payment') : null;
    if (q) { setReturned(q); window.history.replaceState(null, '', window.location.pathname); }
    if (!pendingId) return;
    if (q === 'cancelled') { api(`/payments/${pendingId}/cancel`, { method: 'POST' }).then(() => reload()).catch(() => undefined); return; }
    let stop = false;
    const check = async (n: number) => {
      try { const p = await api<any>(`/payments/${pendingId}/sync`, { method: 'POST' }); if (p.status !== 'PENDING') { if (!stop) await reload(); return; } } catch { /* try again */ }
      if (!stop && n < 5) setTimeout(() => check(n + 1), 2000);
    };
    check(0);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(3); });
    return () => { stop = true; sub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);
  const markPaid = (part: string) => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: { part } }));

  let text: string;
  if (job.paymentMethod === 'PLATFORM') {
    if (state === 'held') text = isCustomer ? t('Paid. UNRET holds the money and sends it to {name} when the job is done.', { name: pro }) : t('The customer paid. You receive {amount} when the job is completed.', { amount: m(heldPayout) });
    else if (state === 'paid_out') text = t('Sent to the professional on {date}.', { date: dateTime(lastPayout, intl) });
    else if (state === 'refunded') text = t('The payment was refunded to the customer.');
    else if (state === 'deposit_paid') text = isCustomer ? t('Deposit paid. UNRET releases it to {name} when the work starts. {amount} is left to pay.', { name: pro, amount: m(s.remainingMinor) }) : t('The customer paid the deposit. You receive it when you start the work; the rest is paid later.');
    else if (depositDue) text = isCustomer ? t('{name} asks for a {amount} deposit before starting. Pay the deposit now and the rest later, or everything at once.', { name: pro, amount: m(s.depositMinor) }) : t('The customer pays a {amount} deposit through UNRET. You receive it when you start the work.', { amount: m(s.depositMinor) });
    else text = isCustomer ? t('Pay {amount} by card in the app. UNRET keeps it safe until the job is done.', { amount: m(s.remainingMinor) }) : t('The customer will pay {amount} through UNRET. You are paid when the job is completed.', { amount: m(s.remainingMinor) });
  } else if (state === 'paid') text = t('{name} confirmed receiving the payment.', { name: pro });
  else if (state === 'awaiting_confirmation') text = isCustomer ? t('You said you paid. Waiting for {name} to confirm receiving it.', { name: pro }) : t('The customer says they paid {amount}. Confirm once you receive it.', { amount: m(awaitingPay?.grossMinor ?? s.remainingMinor) });
  else if (state === 'deposit_paid') text = s.depositPaid ? t('Deposit paid. {amount} is left to pay.', { amount: m(s.remainingMinor) }) : t('{amount} is left to pay.', { amount: m(s.remainingMinor) });
  else if (depositDue) text = isCustomer ? t('{name} asks for a {amount} deposit before starting. The rest is paid when the job is done.', { name: pro, amount: m(s.depositMinor) }) : t('You asked for a {amount} deposit. Confirm here when you receive it.', { amount: m(s.depositMinor) });
  else if (job.paymentMethod === 'CASH') text = isCustomer ? t('Pay {amount} in cash to {name}. They confirm in the app when they receive it.', { amount: m(s.remainingMinor), name: pro }) : t('Collect {amount} in cash, then confirm here.', { amount: m(s.remainingMinor) });
  else text = isCustomer ? t('Pay {amount} to {name} by card or bank transfer, then tap “I have paid”.', { amount: m(s.remainingMinor), name: pro }) : t('When the transfer arrives, confirm it here.');

  const rows: [string, string, boolean?][] = [[t('Total'), m(s.totalMinor)]];
  if (deposit) rows.push([t('Deposit'), m(s.depositMinor) + (s.depositPaid ? ' ✓' : '')]);
  if (s.paidMinor > 0) rows.push([t('Paid'), m(s.paidMinor)]);
  if (s.paidMinor > 0 && s.remainingMinor > 0) rows.push([t('Left to pay'), m(s.remainingMinor), true]);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="label">{methodIcon(job.paymentMethod)} {t(methodLabel(job.paymentMethod))}</Text>
        <PaymentStateBadge state={state === 'deposit_paid' && !s.depositPaid ? 'partly_paid' : state} />
      </Row>
      <View style={{ backgroundColor: th.brandSoft, borderRadius: 10, padding: 10, gap: 4 }}>
        {rows.map(([k, v, strong]) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}><Text variant="small">{k}</Text><Text variant={strong ? 'label' : 'small'} color={th.text}>{v}</Text></Row>
        ))}
      </View>
      {deposit && job.depositNote ? <Text variant="small">💰 {t('Deposit for')}: {job.depositNote}</Text> : null}
      <Text variant="small" style={{ color: th.soft }}>{text}</Text>
      {returned === 'cancelled' && <Alert tone="amber">{t('Payment cancelled. You were not charged.')}</Alert>}
      {returned === 'success' && pendingId && <Alert tone="blue">{t('Thank you! Confirming your payment…')}</Alert>}
      {isCustomer && can('pay_online') && job.paymentProvider === 'stripe' && <Text variant="small">🔒 {t('You pay on Stripe’s secure page. UNRET never sees your card details.')}</Text>}
      {job.payTo && (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: th.brand, borderRadius: 10, padding: 10, gap: 6 }}>
          <Text variant="small">{t('Pay to')} · {job.payTo.holderName}</Text>
          <Text selectable variant="label" style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.5 }} testID="pay-to-iban">{formatIban(job.payTo.iban)}</Text>
          {Platform.OS === 'web' && <Button small variant="outline" title={copied ? t('Copied') : t('Copy IBAN')} onPress={async () => { try { await (globalThis as any).navigator.clipboard.writeText(job.payTo.iban); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }} />}
        </View>
      )}
      {can('mark_paid') && (depositDue ? (
        <View style={{ gap: 8 }}>
          <Button title={t('I have paid the deposit ({amount})', { amount: m(s.depositMinor) })} onPress={() => markPaid('deposit')} loading={busy} />
          <Button title={t('I have paid everything')} variant="outline" onPress={() => markPaid('full')} loading={busy} />
        </View>
      ) : <Button title={s.paidMinor > 0 ? t('I have paid the rest ({amount})', { amount: m(s.remainingMinor) }) : t('I have paid')} onPress={() => markPaid('full')} loading={busy} />)}
      {can('confirm_payment') && (
        <View style={{ gap: 8 }}>
          <Field label={t('Amount received ({cur})', { cur })} hint={depositDue && !awaitingPay ? t('Enter the deposit ({amount}) or the full price, whatever you received.', { amount: m(s.depositMinor) }) : undefined}><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></Field>
          <Button title={job.paymentMethod === 'CASH' ? t('Confirm cash received') : t('Confirm payment received')} onPress={() => run(() => api(`/payments/jobs/${job.id}/confirm`, { body: { amountMinor: majorToMinor(amount) } }))} loading={busy} />
        </View>
      )}
      {!checkout && can('pay_deposit') && <Button title={t('Pay deposit {amount}', { amount: m(s.depositMinor) })} variant="sun" loading={busy} onPress={() => pay('deposit')} />}
      {!checkout && can('pay_online') && <Button title={s.paidMinor > 0 ? t('Pay the rest {amount}', { amount: m(s.remainingMinor) }) : t('Pay {amount} now', { amount: m(s.remainingMinor) })} variant={can('pay_deposit') ? 'outline' : 'sun'} loading={busy} onPress={() => pay()} />}
      {checkout && (
        <View style={{ gap: 8 }}>
          <Alert tone="amber">{t('Development mode: no real payment provider is configured. Simulate the result below.')} ({m(checkout.amountMinor)})</Alert>
          <Button title={t('Simulate successful payment')} loading={busy} onPress={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'succeed' } }); setCheckout(null); await reload(); })} />
          <Button title={t('Simulate failure')} variant="outline" onPress={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'fail' } }); setCheckout(null); await reload(); })} />
        </View>
      )}
      {can('change_payment_method') && (changing ? (
        <View style={{ gap: 8 }}>
          <PaymentMethodPicker value={job.paymentMethod} onChange={(mm) => { setChanging(false); if (mm !== job.paymentMethod) run(() => api(`/payments/jobs/${job.id}/method`, { method: 'PATCH', body: { method: mm } })); }} />
          <Button small variant="ghost" title={`‹ ${t('Back')}`} onPress={() => setChanging(false)} />
        </View>
      ) : <Button small variant="ghost" title={t('Change payment method')} onPress={() => setChanging(true)} />)}
      {live.map((p: any) => (
        <Row key={p.id} style={{ justifyContent: 'space-between' }}>
          <Text variant="small" style={{ flex: 1 }}>{p.kind === 'DEPOSIT' ? t('Deposit') : p.kind === 'BALANCE' ? t('Rest of the price') : t('Payment')} · {dateTime(p.confirmedAt ?? p.createdAt, intl)}{p.status === 'AWAITING_CONFIRMATION' ? ` · ${t('Waiting for confirmation')}` : ''}</Text>
          <Text variant="label">{m(p.grossMinor)}</Text>
        </Row>
      ))}
      {err && <Alert>{err}</Alert>}
    </Card>
  );
}

/** Shown on a job whose time is over while the payment is not confirmed: what is missing and what happens next. */
export function PaymentFollowUp({ job }: { job: any }) {
  const th = useTheme();
  const { t, intl } = useT();
  const c = job.paymentCheck;
  if (!c) return null;
  const amount = money(job.payment?.remainingMinor ?? job.agreedPriceMinor, job.currency, intl);
  const other = job.viewerRole === 'customer' ? t('the professional') : t('the customer');
  const ask = c.mine === 'pay' ? t('Please pay {amount} with the button below.', { amount })
    : c.mine === 'mark_paid' ? t('If you already paid {amount}, tap "I paid" below. If not, please pay the professional now.', { amount })
    : c.mine === 'confirm' ? (c.waitingFor.customer ? t('No payment is confirmed yet. When you receive {amount}, confirm it below.', { amount }) : t('The customer says they paid. Confirm below once the money arrived.'))
    : t('We are waiting for {who} and sent them a reminder.', { who: other });
  const steps: [string, string | null, boolean][] = [
    [t('Job ended'), c.endsAt, true],
    [t('Reminder 1'), c.reminder1At ?? null, !!c.reminder1At],
    [t('Reminder 2'), c.reminder2At ?? c.nextReminderAt ?? null, !!c.reminder2At],
    [t('The UNRET team checks'), c.escalatedAt ?? c.teamCheckAt ?? null, !!c.escalatedAt],
  ];
  return (
    <View testID="payment-follow-up" style={{ borderWidth: 1, borderColor: th.amber, backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 14, padding: 12, gap: 8 }}>
      <Text variant="label">⏰ {c.stage >= 3 ? t('The UNRET team is checking this payment') : t('The job is over and the payment is not confirmed')}</Text>
      <Text>{ask}</Text>
      {c.stage >= 3 && <Text variant="small">{t('Nobody confirmed the payment after two reminders, so the UNRET team was asked to check. They may contact you. You can still confirm it here at any time.')}</Text>}
      <View style={{ gap: 4 }}>
        {steps.map(([label, at, done]) => (
          <Row key={label} gap={8} style={{ flexWrap: 'nowrap' }}>
            <Text style={{ width: 18, color: done ? th.brand : th.muted }}>{done ? '●' : '○'}</Text>
            <Text variant="small" style={{ flex: 1 }}>{label}</Text>
            <Text variant="small" style={{ color: done ? th.text : th.muted }}>{at ? `${done ? '' : `${t('by')} `}${dateTime(at, intl)}` : '—'}</Text>
          </Row>
        ))}
      </View>
    </View>
  );
}
