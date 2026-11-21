'use client';

import { PaymentsTable } from '@/components/payments';
import { PayoutAccountCard } from '@/components/payout-account';
import { PageHeader } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return <ProShell><PageHeader title={t('Earnings')} subtitle={t('Online payments through UNRET and direct payments you recorded.')} /><PayoutAccountCard /><PaymentsTable as="professional" /></ProShell>;
}
