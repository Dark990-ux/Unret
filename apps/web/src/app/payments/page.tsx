'use client';

import { PaymentsTable } from '@/components/payments';
import { Container, PageHeader } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return <RequireAuth><Container><PageHeader title={t('Payment history')} /><PaymentsTable as="customer" /></Container></RequireAuth>;
}
