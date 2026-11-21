'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { dateTime, majorToMinor, money } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Alert, Badge, Button, Field, Input, Tone, cx } from './ui';

export type Method = 'TRANSFER' | 'CASH' | 'PLATFORM';
export const METHODS: { value: Method; icon: string; title: string; text: string }[] = [
  { value: 'TRANSFER', icon: '💳', title: 'Card / bank transfer', text: 'You pay the professional directly. They confirm in the app when the money arrives.' },
  { value: 'CASH', icon: '💵', title: 'Cash', text: 'You pay face to face. The professional confirms in the app when they receive it.' },
  { value: 'PLATFORM', icon: '✦', title: 'Through UNRET', text: 'Pay by card in the app. UNRET keeps the money safe and sends it to the professional when the job is done.' },
];
export const methodLabel = (m: string | null | undefined) => (m === 'CASH' ? 'Cash' : m === 'PLATFORM' ? 'Through UNRET' : m === 'TRANSFER' ? 'Card / bank transfer' : m === 'DIRECT' ? 'Direct payment' : '—');
export const methodIcon = (m: string | null | undefined) => (m === 'CASH' ? '💵' : m === 'PLATFORM' ? '✦' : '💳');

export function PaymentMethodPicker({ value, onChange, name = 'payment-method' }: { value: Method | null; onChange: (m: Method) => void; name?: string }) {
  const { t } = useT();
  return (
    <div role="radiogroup" aria-label={t('How will you pay?')} className="grid gap-2 sm:grid-cols-3">
      {METHODS.map((m) => {
        const on = value === m.value;
        return (
          <label key={m.value} className={cx('flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors', on ? 'border-2 border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-surface-line hover:border-brand-400 dark:border-white/15')}>
            <input type="radio" name={name} value={m.value} checked={on} onChange={() => onChange(m.value)} className="mt-1 h-4 w-4 accent-brand-700" />
            <span className="min-w-0">
              <span className="block font-semibold text-ink dark:text-white">{m.icon} {t(m.title)}</span>
              <span className="mt-0.5 block text-xs text-ink-muted dark:text-white/60">{t(m.text)}</span>
            </span>
          </label>
        );
      })}
    </div>
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

/** Payment card on the job page: what happens next for this method, and the right button for this person. */
export function PaymentPanel({ job, onUpdated }: { job: any; onUpdated: (j: any) => void }) {
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

  let text: string;
  if (job.paymentMethod === 'PLATFORM') {
    text = state === 'held' ? (isCustomer ? t('Paid. UNRET holds the money and sends it to {name} when the job is done.', { name: pro }) : t('The customer paid. You receive {amount} when the job is completed.', { amount: money(platform?.payoutMinor, job.currency, intl) }))
      : state === 'paid_out' ? t('Sent to the professional on {date}.', { date: dateTime(platform?.payoutAt, intl) })
      : state === 'refunded' ? t('The payment was refunded to the customer.')
      : isCustomer ? t('Pay {amount} by card in the app. UNRET keeps it safe until the job is done.', { amount: price }) : t('The customer will pay {amount} through UNRET. You are paid when the job is completed.', { amount: price });
  } else if (state === 'paid') text = t('{name} confirmed receiving the payment.', { name: pro });
  else if (state === 'awaiting_confirmation') text = isCustomer ? t('You said you paid. Waiting for {name} to confirm receiving it.', { name: pro }) : t('The customer says they paid {amount}. Confirm once you receive it.', { amount: price });
  else if (job.paymentMethod === 'CASH') text = isCustomer ? t('Pay {amount} in cash to {name}. They confirm in the app when they receive it.', { amount: price, name: pro }) : t('Collect {amount} in cash, then confirm here.', { amount: price });
  else text = isCustomer ? t('Pay {amount} to {name} by card or bank transfer, then tap “I have paid”.', { amount: price, name: pro }) : t('When the transfer arrives, confirm it here.');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-ink dark:text-white">{methodIcon(job.paymentMethod)} {t(methodLabel(job.paymentMethod))}</div>
        <PaymentStateBadge state={state} />
      </div>
      <p className="text-sm text-ink-soft dark:text-white/70">{text}</p>
      <div className="flex flex-wrap items-end gap-2">
        {can('mark_paid') && <Button loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: {} }))}>{t('I have paid')}</Button>}
        {can('confirm_payment') && (
          <>
            <div className="w-40"><Field label={t('Amount received ({cur})', { cur: job.currency })}><Input id="received-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
            <Button loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/confirm`, { body: { amountMinor: majorToMinor(amount) } }))}>{job.paymentMethod === 'CASH' ? t('Confirm cash received') : t('Confirm payment received')}</Button>
          </>
        )}
        {can('pay_online') && !checkout && <Button loading={busy} className="!bg-accent-500 !text-accent-ink hover:!bg-accent-400" onClick={() => run(async () => setCheckout(await api(`/payments/jobs/${job.id}/checkout`, { method: 'POST' })))}>{t('Pay {amount} now', { amount: price })}</Button>}
        {can('change_payment_method') && !changing && <Button variant="ghost" onClick={() => setChanging(true)}>{t('Change payment method')}</Button>}
      </div>
      {checkout && (
        <div className="space-y-2">
          <Alert tone="amber">{t('Development mode: no real payment provider is configured. Simulate the result below.')}</Alert>
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'succeed' } }); setCheckout(null); await reload(); })}>{t('Simulate successful payment')}</Button>
            <Button variant="outline" onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'fail' } }); setCheckout(null); await reload(); })}>{t('Simulate failure')}</Button>
          </div>
        </div>
      )}
      {changing && (
        <div className="space-y-2">
          <PaymentMethodPicker name="change-method" value={job.paymentMethod} onChange={(m) => { setChanging(false); if (m !== job.paymentMethod) run(() => api(`/payments/jobs/${job.id}/method`, { method: 'PATCH', body: { method: m } })); }} />
          <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>‹ {t('Back')}</Button>
        </div>
      )}
      {job.payments.filter((p: any) => p.status !== 'FAILED').length > 0 && (
        <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">
          {job.payments.filter((p: any) => p.status !== 'FAILED').map((p: any) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-ink-muted">{dateTime(p.confirmedAt ?? p.createdAt, intl)}{p.payoutAt ? ` · ${t('paid out {date}', { date: dateTime(p.payoutAt, intl) })}` : ''}</span>
              <b className="tabular-nums">{money(p.grossMinor, p.currency, intl)}</b>
            </li>
          ))}
        </ul>
      )}
      {err && <Alert>{err}</Alert>}
    </div>
  );
}
