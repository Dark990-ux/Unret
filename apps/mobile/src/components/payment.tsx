import { useState } from 'react';
import { Pressable, View } from 'react-native';
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
  unpaid: ['Not paid yet', 'amber'], awaiting_confirmation: ['Waiting for confirmation', 'blue'], paid: ['Paid', 'green'],
  processing: ['Payment in progress', 'blue'], held: ['Paid, held by UNRET', 'violet'], paid_out: ['Sent to the professional', 'green'], refunded: ['Refunded', 'gray'],
};
export function PaymentStateBadge({ state }: { state: string }) {
  const { t } = useT();
  const [l, tone] = STATE[state] ?? [state, 'gray' as Tone];
  return <Badge tone={tone}>{t(l)}</Badge>;
}

/** Payment panel on the job page: explains what happens next for this method and shows the right button. */
export function PaymentPanel({ job, onUpdated }: { job: any; onUpdated: (j: any) => void }) {
  const th = useTheme();
  const { t, intl } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [amount, setAmount] = useState(String(job.agreedPriceMinor / 100));
  const [checkout, setCheckout] = useState<any | null>(null);
  const can = (a: string) => job.allowedActions.includes(a);
  const isCustomer = job.viewerRole === 'customer';
  const price = money(job.agreedPriceMinor, job.currency, intl);
  const pro = job.professional.displayName;
  const state: string = job.paymentState ?? 'unpaid';
  const platform = job.payments.find((p: any) => p.method === 'PLATFORM' && p.status !== 'FAILED');
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(null); try { const r = await fn(); if (r?.id && r.allowedActions) onUpdated(r); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const reload = async () => onUpdated(await api(`/jobs/${job.id}`));

  let text = '';
  if (job.paymentMethod === 'PLATFORM') {
    text = state === 'held' ? (isCustomer ? t('Paid. UNRET holds the money and sends it to {name} when the job is done.', { name: pro }) : t('The customer paid. You receive {amount} when the job is completed.', { amount: money(platform?.payoutMinor, job.currency, intl) }))
      : state === 'paid_out' ? t('Sent to the professional on {date}.', { date: dateTime(platform?.payoutAt, intl) })
      : state === 'refunded' ? t('The payment was refunded to the customer.')
      : isCustomer ? t('Pay {amount} by card in the app. UNRET keeps it safe until the job is done.', { amount: price }) : t('The customer will pay {amount} through UNRET. You are paid when the job is completed.', { amount: price });
  } else if (state === 'paid') {
    text = t('{name} confirmed receiving the payment.', { name: pro });
  } else if (state === 'awaiting_confirmation') {
    text = isCustomer ? t('You said you paid. Waiting for {name} to confirm receiving it.', { name: pro }) : t('The customer says they paid {amount}. Confirm once you receive it.', { amount: price });
  } else if (job.paymentMethod === 'CASH') {
    text = isCustomer ? t('Pay {amount} in cash to {name}. They confirm in the app when they receive it.', { amount: price, name: pro }) : t('Collect {amount} in cash, then confirm here.', { amount: price });
  } else {
    text = isCustomer ? t('Pay {amount} to {name} by card or bank transfer, then tap “I have paid”.', { amount: price, name: pro }) : t('When the transfer arrives, confirm it here.');
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="label">{methodIcon(job.paymentMethod)} {t(methodLabel(job.paymentMethod))}</Text>
        <PaymentStateBadge state={state} />
      </Row>
      <Text variant="small" style={{ color: th.soft }}>{text}</Text>
      {can('mark_paid') && <Button title={t('I have paid')} onPress={() => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: {} }))} loading={busy} />}
      {can('confirm_payment') && (
        <View style={{ gap: 8 }}>
          <Field label={t('Amount received ({cur})', { cur: job.currency })}><Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /></Field>
          <Button title={job.paymentMethod === 'CASH' ? t('Confirm cash received') : t('Confirm payment received')} onPress={() => run(() => api(`/payments/jobs/${job.id}/confirm`, { body: { amountMinor: majorToMinor(amount) } }))} loading={busy} />
        </View>
      )}
      {can('pay_online') && !checkout && <Button title={t('Pay {amount} now', { amount: price })} variant="sun" loading={busy} onPress={() => run(async () => setCheckout(await api(`/payments/jobs/${job.id}/checkout`, { method: 'POST' })))} />}
      {checkout && (
        <View style={{ gap: 8 }}>
          <Alert tone="amber">{t('Development mode: no real payment provider is configured. Simulate the result below.')}</Alert>
          <Button title={t('Simulate successful payment')} loading={busy} onPress={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'succeed' } }); setCheckout(null); await reload(); })} />
          <Button title={t('Simulate failure')} variant="outline" onPress={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'fail' } }); setCheckout(null); await reload(); })} />
        </View>
      )}
      {can('change_payment_method') && (changing ? (
        <View style={{ gap: 8 }}>
          <PaymentMethodPicker value={job.paymentMethod} onChange={(m) => { setChanging(false); if (m !== job.paymentMethod) run(() => api(`/payments/jobs/${job.id}/method`, { method: 'PATCH', body: { method: m } })); }} />
        </View>
      ) : <Button small variant="ghost" title={t('Change payment method')} onPress={() => setChanging(true)} />)}
      {job.payments.filter((p: any) => p.status !== 'FAILED').map((p: any) => (
        <Row key={p.id} style={{ justifyContent: 'space-between' }}>
          <Text variant="small">{dateTime(p.confirmedAt ?? p.createdAt, intl)}</Text>
          <Text variant="label">{money(p.grossMinor, p.currency, intl)}</Text>
        </Row>
      ))}
      {err && <Alert>{err}</Alert>}
    </Card>
  );
}
