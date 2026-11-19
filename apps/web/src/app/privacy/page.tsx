'use client';

import { Container } from '@/components/shell';
import { Alert } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return (
    <Container className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight text-ink dark:text-white">{t('Privacy policy')}</h1>
      <div className="mt-6"><Alert tone="amber">{t('Placeholder document. The final text must be prepared with legal counsel before launch (GDPR, consumer protection, Digital Services Act and platform-to-business rules).')}</Alert></div>
    </Container>
  );
}
