'use client';

import { PaymentsTable } from '@/components/payments';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PayoutAccountCard, ProviderPayoutCard } from '@/components/payout-account';
import { PageHeader } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  const [status, setStatus] = useState<any | null>(null);
  const load = useCallback(() => { api('/payments/payouts/status').then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(load, [load]);
  return <ProShell><PageHeader title={t('Earnings')} subtitle={t('Online payments through UNRET and direct payments you recorded.')} />
    {status?.connect && <ProviderPayoutCard status={status} onChange={load} />}
    {status && <PayoutAccountCard transfersOnly={!!status.connect} />}<PaymentsTable as="professional" /></ProShell>;
}
