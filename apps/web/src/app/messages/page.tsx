'use client';

import { ConversationList } from '@/components/conversations';
import { Container, PageHeader } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return <RequireAuth><Container className="max-w-3xl"><PageHeader title={t('Messages')} /><ConversationList /></Container></RequireAuth>;
}
