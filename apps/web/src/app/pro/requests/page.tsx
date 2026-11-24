'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Inbox, MapPin, Paperclip, Wifi } from 'lucide-react';
import { Badge, Card, Empty, PageHeader, PageLoader, StatusBadge, Tabs } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { methodIcon, methodLabel } from '@/components/payment';
import { date, money, period, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { describeAvailability } from '@/lib/availability';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <ProShell><RequestInbox /></ProShell>;
}

function RequestInbox() {
  const { t, intl } = useT();
  const [filter, setFilter] = useState<'new' | 'offered' | 'declined' | 'all'>('new');
  const { data, loading, reload } = useApi<{ items: any[]; total: number }>('/requests/inbox', { filter, pageSize: 50 });
  useRealtime('notification', (n: any) => n.type === 'NEW_MATCHING_REQUEST' && reload());
  const urgency: Record<string, [string, any]> = { EMERGENCY: [t('Emergency'), 'red'], HIGH: [t('Soon'), 'amber'] };
  return (
    <>
      <PageHeader title={t('Requests')} subtitle={t('Requests matched to your services, area, availability and qualifications.')} />
      <Tabs value={filter} onChange={setFilter} items={[{ value: 'new', label: t('New') }, { value: 'offered', label: t('Offer sent') }, { value: 'declined', label: t('Not interested') }, { value: 'all', label: t('All') }]} />
      {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<Inbox className="h-8 w-8" />} title={t('No requests here')} text={filter === 'new' ? t('Keep your services, area and working hours up to date to receive more requests.') : undefined} /> : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Link key={r.requestId} href={`/pro/requests/${r.requestId}`} className="block">
              <Card className="p-4 transition-shadow hover:shadow-md sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink dark:text-white">{r.title}</span>
                      {!r.viewed && <Badge tone="green">{t('New')}</Badge>}
                      {r.direct && <Badge tone="amber">✦ {t('Direct request')}</Badge>}
                      {urgency[r.urgency] && <Badge tone={urgency[r.urgency][1]}>{urgency[r.urgency][0]}</Badge>}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-muted">{r.categoryName} · {timeAgo(r.notifiedAt, intl)}</div>
                  </div>
                  <div className="text-right text-sm">
                    {(r.budgetMinMinor || r.budgetMaxMinor) ? <div className="font-medium">{t('Budget')}: {r.budgetMaxMinor ? `≤ ${money(r.budgetMaxMinor, r.currency, intl)}` : `≥ ${money(r.budgetMinMinor, r.currency, intl)}`}</div> : <div className="text-ink-muted">{t('No budget given')}</div>}
                    {r.myOffer && <div className="mt-1"><StatusBadge status={r.myOffer.status} /></div>}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-ink-soft dark:text-white/70">{r.description}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                  {r.serviceMode === 'REMOTE' ? <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{t('Remote')}</span> : <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.city}{r.distanceKm != null && ` · ${r.distanceKm} km`}</span>}
                  {(describeAvailability(r, t, intl) || r.preferredDate) && <span>{t('Available')}: {describeAvailability(r, t, intl) ?? period(r.preferredDate, r.preferredDateTo, intl)}</span>}
                  {r.attachmentCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{r.attachmentCount}</span>}
                  {r.paymentMethod && <span>{methodIcon(r.paymentMethod)} {t(methodLabel(r.paymentMethod))}</span>}
                  <span>{t('{n} offers so far', { n: r.offerCount })}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
