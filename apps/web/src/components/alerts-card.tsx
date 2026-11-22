'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { Button, Card } from './ui';

/** The professionals you asked to be told about when they are free. */
export function AvailabilityAlertsCard() {
  const { t } = useT();
  const q = useApi<{ professionalId: string; name: string; since: string }[]>('/availability/alerts/mine');
  return (
    <Card className="space-y-3 p-5 sm:p-6" data-testid="alerts-card">
      <h2 className="font-semibold text-ink dark:text-white">🔔 {t('Notify me when free')}</h2>
      <p className="text-sm text-ink-muted">{t('Busy professionals you follow. We notify you once as soon as they have free days, then the alert switches off.')}</p>
      {!q.data?.length ? <p className="text-sm text-ink-soft dark:text-white/70">{t('No alerts yet. Open a professional’s profile and tap “Notify me when free”.')}</p> : (
        <ul className="divide-y divide-surface-line dark:divide-white/10">
          {q.data.map((a) => (
            <li key={a.professionalId} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/pros/${a.professionalId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{a.name}</Link>
              <Button size="sm" variant="ghost" onClick={async () => { await api(`/availability/${a.professionalId}/alert`, { method: 'DELETE' }); q.reload(); }}>{t('Cancel alert')}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
