import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Switch, View } from 'react-native';
import { checkIban } from '@unret/shared';
import { formatIban } from '@/components/payment';
import { useTheme } from '@/components/theme';
import { Alert, Badge, Button, Card, Field, Input, Loader, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

/** Where UNRET sends the money customers pay through the app. */
export default function PayoutAccountScreen() {
  const th = useTheme();
  const { t, intl } = useT();
  const q = useApi<any>('/payments/payout-account');
  const ps = useApi<any>('/payments/payouts/status');
  // Coming back from Stripe's pages: refresh the status.
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st === 'active') ps.reload(); }); return () => sub.remove(); }, [ps.reload]);
  const openProvider = async (path: string, body?: unknown) => {
    setBusy(true); setErr(null);
    try {
      const web = Platform.OS === 'web' && typeof window !== 'undefined';
      const r = await api<any>(path, { body: body ?? (web ? { returnUrl: `${window.location.origin}/pro/payout` } : {}) });
      if (web) window.location.assign(r.url); else await Linking.openURL(r.url);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ holderName: '', iban: '', showToCustomers: true });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (q.loading || ps.loading) return <Loader />;
  const c = ps.data?.connect;
  const acc = q.data ?? null;
  const live = f.iban.replace(/\s/g, '').length >= 15 ? checkIban(f.iban) : null;
  const put = async (body: any) => { setBusy(true); setErr(null); try { q.setData(await api('/payments/payout-account', { method: 'PUT', body })); setEditing(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const form = !acc || editing;
  return (
    <Screen onRefresh={() => { q.refresh(); ps.refresh(); }} refreshing={q.refreshing}>
      {c && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h2">💸 {t('Payouts for in-app payments')}</Text>
            {c.status === 'active' ? <Badge tone="green">{t('Active')}</Badge> : <Badge tone="amber">{c.status === 'incomplete' ? t('Setup not finished') : t('Not set up')}</Badge>}
          </Row>
          <Text variant="small">{c.status === 'active' ? t('Money customers pay through UNRET is sent to your bank account via Stripe: deposits when you start the work, the rest when the job is completed.') : t('Customers can pay you by card in the app. To receive that money, set up payouts with Stripe, UNRET’s payment partner: add your bank account (IBAN) and confirm your identity. It takes about 5 minutes.')}</Text>
          {ps.data.heldMinor > 0 && <Alert tone="blue">{c.status === 'active' ? t('{amount} is held by UNRET and will be sent to you when the work starts or is completed.', { amount: money(ps.data.heldMinor, 'RON', intl) }) : t('{amount} is waiting for you. Finish the setup to receive it.', { amount: money(ps.data.heldMinor, 'RON', intl) })}</Alert>}
          {c.status !== 'active' && <Button title={c.status === 'incomplete' ? t('Continue setup on Stripe') : t('Set up payouts with Stripe')} loading={busy} onPress={() => openProvider('/payments/payouts/onboard')} />}
          {c.status !== 'not_started' && <Button title={t('Open Stripe dashboard')} variant="outline" onPress={() => openProvider('/payments/payouts/dashboard', {})} />}
          <Text variant="small">🔒 {t('Your bank details and ID are handled by Stripe and are not stored by UNRET.')}</Text>
        </Card>
      )}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="h2">🏦 {c ? t('IBAN for bank transfers') : t('Payout account (IBAN)')}</Text>
          {acc ? <Badge tone="green">{t('Active')}</Badge> : <Badge tone="amber">{t('Not added')}</Badge>}
        </Row>
        {acc && !editing && (
          <View style={{ gap: 10 }}>
            <Text variant="small">{acc.holderName}{acc.bankCode ? ` · ${acc.bankCode}` : ''}</Text>
            <Text variant="label" style={{ fontSize: 18, letterSpacing: 1 }}>{acc.ibanMasked}</Text>
            {!c && acc.heldMinor > 0 && <Alert tone="blue">{t('{amount} is held by UNRET and will be sent to this account when the work starts or is completed.', { amount: money(acc.heldMinor, 'RON', intl) })}</Alert>}
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1 }}>{t('Show my IBAN to customers who pay by bank transfer')}</Text>
              <Switch value={acc.showToCustomers} disabled={busy} onValueChange={(v) => put({ holderName: acc.holderName, showToCustomers: v })} trackColor={{ true: th.brand }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} accessibilityLabel={t('Show my IBAN to customers who pay by bank transfer')} />
            </Row>
            <Button title={t('Change account')} variant="outline" onPress={() => { setF({ holderName: acc.holderName, iban: '', showToCustomers: acc.showToCustomers }); setEditing(true); }} />
            <Button title={t('Remove')} variant="ghost" small onPress={async () => { await api('/payments/payout-account', { method: 'DELETE' }); q.setData(null); }} />
          </View>
        )}
        {form && (
          <View style={{ gap: 12 }}>
            {!acc && <Text variant="small">{c ? t('Optional: customers who pay you by bank transfer see this IBAN on the job page.') : t('Add the bank account where UNRET sends the money customers pay through the app. Deposits are sent when you start the work, the rest when the job is completed.')}</Text>}
            <Field label={t('Account holder name')} required><Input value={f.holderName} onChangeText={(holderName) => setF({ ...f, holderName })} autoComplete="name" accessibilityLabel={t('Account holder name')} /></Field>
            <Field label="IBAN" required hint={live ? (live.valid ? `✓ ${t('Valid IBAN')}${live.bankCode ? ` · ${live.bankCode}` : ''}` : `✗ ${t(live.reason)}`) : 'RO49 AAAA 1B31 0075 9384 0000'}>
              <Input value={f.iban} onChangeText={(v) => setF({ ...f, iban: formatIban(v) })} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="IBAN" />
            </Field>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1 }}>{t('Show my IBAN to customers who pay by bank transfer')}</Text>
              <Switch value={f.showToCustomers} onValueChange={(showToCustomers) => setF({ ...f, showToCustomers })} trackColor={{ true: th.brand }} thumbColor="#fff" {...({ activeThumbColor: '#fff' } as object)} />
            </Row>
            <Text variant="small">🔒 {t('Your IBAN is stored encrypted. Only the last 4 digits are shown here.')}</Text>
            {err && <Alert>{err}</Alert>}
            <Button title={t('Save account')} loading={busy} disabled={f.holderName.trim().length < 3 || !live?.valid} onPress={() => put(f)} />
            {editing && <Button title={`‹ ${t('Back')}`} variant="ghost" onPress={() => setEditing(false)} />}
          </View>
        )}
      </Card>
    </Screen>
  );
}
