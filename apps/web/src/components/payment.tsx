'use client';

import { Fragment, useState } from 'react';
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
  unpaid: ['Not paid yet', 'amber'], awaiting_confirmation: ['Waiting for confirmation', 'blue'], deposit_paid: ['Deposit paid', 'blue'], paid: ['Paid', 'green'],
  partly_paid: ['Partly paid', 'blue'], processing: ['Payment in progress', 'blue'], held: ['Paid, held by UNRET', 'violet'], paid_out: ['Sent to the professional', 'green'], refunded: ['Refunded', 'gray'],
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
  const { t, intl } = useT();
  const amount = value && Number(price) > 0 ? money(Math.round(((majorToMinor(price) ?? 0) * Number(value)) / 100), currency, intl) : null;
  return (
    <div className="space-y-2 rounded-xl border border-surface-line p-3 dark:border-white/15">
      <div className="text-sm font-medium text-ink dark:text-white">{t('Deposit before starting')}</div>
      <div role="radiogroup" aria-label={t('Deposit before starting')} className="flex flex-wrap gap-1.5">
        {['', ...DEPOSIT_OPTIONS.map(String)].map((v) => (
          <button key={v || 'none'} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v, note)}
            className={cx('rounded-full border px-3 py-1 text-sm', value === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-surface-line hover:border-brand-400 dark:border-white/15')}>
            {v ? `${v}%` : t('No deposit')}
          </button>
        ))}
      </div>
      {value ? (
        <>
          <p className="text-xs text-ink-muted">{amount ? t('The customer pays {amount} before you start; the rest when the job is done.', { amount }) : t('The customer pays this part before you start; the rest when the job is done.')}</p>
          <Input value={note} onChange={(e) => onChange(value, e.target.value)} maxLength={300} placeholder={t('What the deposit covers, e.g. materials')} aria-label={t('What the deposit covers')} />
        </>
      ) : <p className="text-xs text-ink-muted">{t('The customer pays everything at the end, or as agreed.')}</p>}
    </div>
  );
}

/** Small line shown on offer cards when a deposit is requested. */
export function DepositLine({ priceMinor, percent, note, currency }: { priceMinor: number; percent?: number | null; note?: string | null; currency: string }) {
  const { t, intl } = useT();
  if (!percent) return null;
  return <div className="text-sm text-ink-soft dark:text-white/70">💰 {t('Deposit: {amount} ({pct}%) before starting', { amount: money(Math.round((priceMinor * percent) / 100), currency, intl), pct: percent })}{note ? ` · ${note}` : ''}</div>;
}

function CopyIban({ iban }: { iban: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(iban); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* ignore */ } }}>{done ? t('Copied') : t('Copy IBAN')}</Button>;
}

/** Payment card on the job page: amounts, what happens next for this method, and the right button for this person. */
export function PaymentPanel({ job, onUpdated }: { job: any; onUpdated: (j: any) => void }) {
  const { t, intl } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [checkout, setCheckout] = useState<any | null>(null);
  const can = (a: string) => job.allowedActions.includes(a);
  const isCustomer = job.viewerRole === 'customer';
  const cur = job.currency;
  const m = (v: number) => money(v, cur, intl);
  const s = job.payment ?? { totalMinor: job.agreedPriceMinor, depositMinor: job.depositMinor ?? 0, paidMinor: 0, remainingMinor: job.agreedPriceMinor, depositPaid: false };
  const deposit = s.depositMinor > 0;
  const depositDue = deposit && s.paidMinor === 0;
  const awaitingPay = job.payments.find((p: any) => p.status === 'AWAITING_CONFIRMATION');
  const suggested = awaitingPay?.grossMinor ?? (depositDue ? s.depositMinor : s.remainingMinor);
  const [amount, setAmount] = useState(String(suggested / 100));
  const pro = job.professional.displayName;
  const state: string = job.paymentState ?? 'unpaid';
  const live = job.payments.filter((p: any) => p.status !== 'FAILED');
  const platformPaid = live.filter((p: any) => p.method === 'PLATFORM' && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status));
  const heldPayout = platformPaid.filter((p: any) => p.payoutStatus === 'HELD').reduce((a: number, p: any) => a + p.payoutMinor, 0);
  const lastPayout = platformPaid.map((p: any) => p.payoutAt).filter(Boolean).sort().pop();
  const run = async (fn: () => Promise<any>) => { setBusy(true); setErr(null); try { const r = await fn(); if (r?.id && r.allowedActions) onUpdated(r); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const reload = async () => onUpdated(await api(`/jobs/${job.id}`));
  const pay = (part?: string) => run(async () => setCheckout(await api(`/payments/jobs/${job.id}/checkout`, { body: part ? { part } : {} })));

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-ink dark:text-white">{methodIcon(job.paymentMethod)} {t(methodLabel(job.paymentMethod))}</div>
        <PaymentStateBadge state={state === 'deposit_paid' && !s.depositPaid ? 'partly_paid' : state} />
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-surface-muted p-3 text-sm dark:bg-white/5">
        {rows.map(([k, v, strong]) => (<Fragment key={k}><dt className="text-ink-muted">{k}</dt><dd className={cx('text-right tabular-nums', strong ? 'font-bold text-ink dark:text-white' : 'text-ink dark:text-white')}>{v}</dd></Fragment>))}
      </dl>
      {deposit && job.depositNote && <p className="text-xs text-ink-muted">💰 {t('Deposit for')}: {job.depositNote}</p>}
      <p className="text-sm text-ink-soft dark:text-white/70">{text}</p>
      {job.payTo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-brand-300 p-3 dark:border-brand-700">
          <div className="min-w-0 text-sm">
            <div className="text-xs text-ink-muted">{t('Pay to')} · {job.payTo.holderName}</div>
            <div className="font-mono font-semibold tracking-wide text-ink dark:text-white" data-testid="pay-to-iban">{formatIban(job.payTo.iban)}</div>
          </div>
          <CopyIban iban={job.payTo.iban} />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {can('mark_paid') && (depositDue ? (
          <>
            <Button loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: { part: 'deposit' } }))}>{t('I have paid the deposit ({amount})', { amount: m(s.depositMinor) })}</Button>
            <Button variant="outline" loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: { part: 'full' } }))}>{t('I have paid everything')}</Button>
          </>
        ) : <Button loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/mark-paid`, { body: { part: 'full' } }))}>{s.paidMinor > 0 ? t('I have paid the rest ({amount})', { amount: m(s.remainingMinor) }) : t('I have paid')}</Button>)}
        {can('confirm_payment') && (
          <>
            <div className="w-40"><Field label={t('Amount received ({cur})', { cur })}><Input id="received-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field></div>
            <Button loading={busy} onClick={() => run(() => api(`/payments/jobs/${job.id}/confirm`, { body: { amountMinor: majorToMinor(amount) } }))}>{job.paymentMethod === 'CASH' ? t('Confirm cash received') : t('Confirm payment received')}</Button>
            {depositDue && !awaitingPay && <span className="w-full text-xs text-ink-muted">{t('Enter the deposit ({amount}) or the full price, whatever you received.', { amount: m(s.depositMinor) })}</span>}
          </>
        )}
        {!checkout && can('pay_deposit') && <Button loading={busy} className="!bg-accent-500 !text-accent-ink hover:!bg-accent-400" onClick={() => pay('deposit')}>{t('Pay deposit {amount}', { amount: m(s.depositMinor) })}</Button>}
        {!checkout && can('pay_online') && <Button loading={busy} variant={can('pay_deposit') ? 'outline' : undefined} className={can('pay_deposit') ? '' : '!bg-accent-500 !text-accent-ink hover:!bg-accent-400'} onClick={() => pay()}>{s.paidMinor > 0 ? t('Pay the rest {amount}', { amount: m(s.remainingMinor) }) : t('Pay {amount} now', { amount: m(s.remainingMinor) })}</Button>}
        {can('change_payment_method') && !changing && <Button variant="ghost" onClick={() => setChanging(true)}>{t('Change payment method')}</Button>}
      </div>
      {checkout && (
        <div className="space-y-2">
          <Alert tone="amber">{t('Development mode: no real payment provider is configured. Simulate the result below.')} ({m(checkout.amountMinor)})</Alert>
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'succeed' } }); setCheckout(null); await reload(); })}>{t('Simulate successful payment')}</Button>
            <Button variant="outline" onClick={() => run(async () => { await api(`/payments/${checkout.paymentId}/mock-confirm`, { body: { outcome: 'fail' } }); setCheckout(null); await reload(); })}>{t('Simulate failure')}</Button>
          </div>
        </div>
      )}
      {changing && (
        <div className="space-y-2">
          <PaymentMethodPicker name="change-method" value={job.paymentMethod} onChange={(mm) => { setChanging(false); if (mm !== job.paymentMethod) run(() => api(`/payments/jobs/${job.id}/method`, { method: 'PATCH', body: { method: mm } })); }} />
          <Button size="sm" variant="ghost" onClick={() => setChanging(false)}>‹ {t('Back')}</Button>
        </div>
      )}
      {live.length > 0 && (
        <ul className="divide-y divide-surface-line text-sm dark:divide-white/10">
          {live.map((p: any) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-ink-muted">{p.kind === 'DEPOSIT' ? t('Deposit') : p.kind === 'BALANCE' ? t('Rest of the price') : t('Payment')} · {dateTime(p.confirmedAt ?? p.createdAt, intl)}{p.payoutAt ? ` · ${t('paid out {date}', { date: dateTime(p.payoutAt, intl) })}` : ''}{p.status === 'AWAITING_CONFIRMATION' ? ` · ${t('Waiting for confirmation')}` : ''}</span>
              <b className="tabular-nums">{m(p.grossMinor)}</b>
            </li>
          ))}
        </ul>
      )}
      {err && <Alert>{err}</Alert>}
    </div>
  );
}
