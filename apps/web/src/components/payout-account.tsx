'use client';

import { useEffect, useState } from 'react';
import { checkIban } from '@unret/shared';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Alert, Badge, Button, Card, Checkbox, Field, Input } from './ui-exports';
import { formatIban } from './payment';

/** Professional's bank account (IBAN) where UNRET sends online payments; optionally shown to customers paying by transfer. */
export function PayoutAccountCard() {
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
        <h2 className="font-semibold text-ink dark:text-white">🏦 {t('Payout account (IBAN)')}</h2>
        {acc ? <Badge tone="green">{t('Active')}</Badge> : <Badge tone="amber">{t('Not added')}</Badge>}
      </div>
      {acc && !editing && (
        <div className="space-y-3 text-sm">
          <div><div className="text-ink-muted">{acc.holderName}{acc.bankCode ? ` · ${acc.bankCode}` : ''}</div><div className="font-mono text-base font-semibold tracking-wide text-ink dark:text-white">{acc.ibanMasked}</div></div>
          {acc.heldMinor > 0 && <Alert tone="blue">{t('{amount} is held by UNRET and will be sent to this account when the work starts or is completed.', { amount: money(acc.heldMinor, 'RON', intl) })}</Alert>}
          <Checkbox label={t('Show my IBAN to customers who pay by bank transfer')} checked={acc.showToCustomers} onChange={toggleShow} disabled={busy} />
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setF({ holderName: acc.holderName, iban: '', showToCustomers: acc.showToCustomers }); setEditing(true); }}>{t('Change account')}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (confirm(t('Remove this payout account?'))) { await api('/payments/payout-account', { method: 'DELETE' }); setAcc(null); } }}>{t('Remove')}</Button></div>
        </div>
      )}
      {(!acc || editing) && (
        <form onSubmit={save} className="space-y-3">
          {!acc && <p className="text-sm text-ink-soft dark:text-white/70">{t('Add the bank account where UNRET sends the money customers pay through the app. Deposits are sent when you start the work, the rest when the job is completed.')}</p>}
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
