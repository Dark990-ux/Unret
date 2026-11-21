'use client';

import { useEffect, useState } from 'react';
import { checkIban } from '@unret/shared';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Alert, Badge, Button, Card, Checkbox, Field, Input } from './ui-exports';
import { formatIban } from './payment';

/** Professional's bank account (IBAN) where UNRET sends online payments; optionally shown to customers paying by transfer. */
export function PayoutAccountCard({ transfersOnly = false }: { transfersOnly?: boolean }) {
  const { t, intl } = useT();
  const [acc, setAcc] = useState<any | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ holderName: '', iban: '', showToCustomers: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/payments/payout-account').then((a) => setAcc(a ?? null)).catch(() => setAcc(null)); }, []);
  const live = f.iban.replace(/\s/g, '').length >= 15 ? checkIban(f.iban) : null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { setAcc(await api('/payments/payout-account', { method: 'PUT', body: f })); setEditing(false); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const toggleShow = async () => { if (!acc) return; setBusy(true); try { setAcc(await api('/payments/payout-account', { method: 'PUT', body: { holderName: acc.holderName, showToCustomers: !acc.showToCustomers } })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  if (acc === undefined) return null;
  return (
    <Card className="mb-6 p-5" data-testid="payout-account">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink dark:text-white">🏦 {transfersOnly ? t('IBAN for bank transfers') : t('Payout account (IBAN)')}</h2>
        {acc ? <Badge tone="green">{t('Active')}</Badge> : <Badge tone="amber">{t('Not added')}</Badge>}
      </div>
      {acc && !editing && (
        <div className="space-y-3 text-sm">
          <div><div className="text-ink-muted">{acc.holderName}{acc.bankCode ? ` · ${acc.bankCode}` : ''}</div><div className="font-mono text-base font-semibold tracking-wide text-ink dark:text-white">{acc.ibanMasked}</div></div>
          {!transfersOnly && acc.heldMinor > 0 && <Alert tone="blue">{t('{amount} is held by UNRET and will be sent to this account when the work starts or is completed.', { amount: money(acc.heldMinor, 'RON', intl) })}</Alert>}
          <Checkbox label={t('Show my IBAN to customers who pay by bank transfer')} checked={acc.showToCustomers} onChange={toggleShow} disabled={busy} />
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setF({ holderName: acc.holderName, iban: '', showToCustomers: acc.showToCustomers }); setEditing(true); }}>{t('Change account')}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (confirm(t('Remove this payout account?'))) { await api('/payments/payout-account', { method: 'DELETE' }); setAcc(null); } }}>{t('Remove')}</Button></div>
        </div>
      )}
      {(!acc || editing) && (
        <form onSubmit={save} className="space-y-3">
          {!acc && <p className="text-sm text-ink-soft dark:text-white/70">{transfersOnly ? t('Optional: customers who pay you by bank transfer see this IBAN on the job page.') : t('Add the bank account where UNRET sends the money customers pay through the app. Deposits are sent when you start the work, the rest when the job is completed.')}</p>}
          <Field label={t('Account holder name')} required><Input value={f.holderName} onChange={(e) => setF({ ...f, holderName: e.target.value })} required minLength={3} autoComplete="name" /></Field>
          <Field label="IBAN" required hint={live ? (live.valid ? `✓ ${t('Valid IBAN')}${live.bankCode ? ` · ${live.bankCode}` : ''}` : `✗ ${t(live.reason)}`) : 'RO49 AAAA 1B31 0075 9384 0000'}>
            <Input value={f.iban} onChange={(e) => setF({ ...f, iban: formatIban(e.target.value) })} required className="font-mono uppercase" autoComplete="off" spellCheck={false} />
          </Field>
          <Checkbox label={t('Show my IBAN to customers who pay by bank transfer')} checked={f.showToCustomers} onChange={(e) => setF({ ...f, showToCustomers: e.target.checked })} />
          <p className="text-xs text-ink-muted">🔒 {t('Your IBAN is stored encrypted. Only the last 4 digits are shown here.')}</p>
          {err && <Alert>{err}</Alert>}
          <div className="flex gap-2"><Button type="submit" loading={busy} disabled={!!live && !live.valid}>{t('Save account')}</Button>{editing && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>‹ {t('Back')}</Button>}</div>
        </form>
      )}
    </Card>
  );
}

/** Payouts through the payment provider (Stripe Connect): bank account and identity check happen on Stripe's pages. */
export function ProviderPayoutCard({ status, onChange }: { status: any; onChange: () => void }) {
  const { t, intl } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = status.connect;
  const go = async (path: string, body?: unknown) => { setBusy(true); setErr(null); try { const r = await api<any>(path, { body: body ?? {} }); window.location.assign(r.url); } catch (x) { setErr((x as Error).message); setBusy(false); } };
  useEffect(() => { if (new URLSearchParams(window.location.search).has('stripe')) { window.history.replaceState(null, '', window.location.pathname); onChange(); } }, [onChange]);
  const back = typeof window !== 'undefined' ? `${window.location.origin}/pro/earnings?stripe=1` : undefined;
  return (
    <Card className="mb-6 p-5" data-testid="provider-payouts">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink dark:text-white">💸 {t('Payouts for in-app payments')}</h2>
        {c.status === 'active' ? <Badge tone="green">{t('Active')}</Badge> : c.status === 'incomplete' ? <Badge tone="amber">{t('Setup not finished')}</Badge> : <Badge tone="amber">{t('Not set up')}</Badge>}
      </div>
      <div className="space-y-3 text-sm text-ink-soft dark:text-white/70">
        {c.status === 'active'
          ? <p>{t('Money customers pay through UNRET is sent to your bank account via Stripe: deposits when you start the work, the rest when the job is completed.')}</p>
          : <p>{t('Customers can pay you by card in the app. To receive that money, set up payouts with Stripe, UNRET’s payment partner: add your bank account (IBAN) and confirm your identity. It takes about 5 minutes.')}</p>}
        {status.heldMinor > 0 && <Alert tone="blue">{c.status === 'active' ? t('{amount} is held by UNRET and will be sent to you when the work starts or is completed.', { amount: money(status.heldMinor, 'RON', intl) }) : t('{amount} is waiting for you. Finish the setup to receive it.', { amount: money(status.heldMinor, 'RON', intl) })}</Alert>}
        <div className="flex flex-wrap gap-2">
          {c.status !== 'active' && <Button loading={busy} onClick={() => go('/payments/payouts/onboard', { returnUrl: back })}>{c.status === 'incomplete' ? t('Continue setup on Stripe') : t('Set up payouts with Stripe')}</Button>}
          {c.status !== 'not_started' && <Button variant="outline" loading={busy && c.status === 'active'} onClick={() => go('/payments/payouts/dashboard')}>{t('Open Stripe dashboard')}</Button>}
        </div>
        <p className="text-xs text-ink-muted">🔒 {t('Your bank details and ID are handled by Stripe and are not stored by UNRET.')}</p>
        {err && <Alert>{err}</Alert>}
      </div>
    </Card>
  );
}
