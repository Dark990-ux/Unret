'use client';

import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, cx } from './ui';

const BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  vip: { label: 'VIP', icon: '👑', cls: 'bg-accent-500 text-accent-ink' },
  deluxe: { label: 'Deluxe', icon: '💎', cls: 'bg-brand-700 text-white' },
  standard: { label: 'Standard', icon: '⭐', cls: 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' },
};

/** The paid plan's badge on profiles and search results. */
export function PlanBadge({ badge, className }: { badge?: string | null; className?: string }) {
  const b = badge ? BADGE[badge] : null;
  if (!b) return null;
  return <span data-testid="plan-badge" className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', b.cls, className)}>{b.icon} {b.label}</span>;
}

/** Paid placement must be disclosed to customers (EU P2B / Omnibus rules). */
export function PromotedLabel() {
  const { t } = useT();
  return <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted" title={t('Shown higher because this professional has a paid plan.')}>{t('Promoted')}</span>;
}

/** "New requests today: 4 of 7" with an upgrade nudge when requests were missed. */
export function UsageCard({ s, compact }: { s: any; compact?: boolean }) {
  const { t } = useT();
  if (!s) return null;
  const limit: number | null = s.requestsPerDay;
  const pct = limit ? Math.min(100, Math.round((s.usedToday / limit) * 100)) : 100;
  return (
    <Card className={cx('p-5', compact && 'mb-6')} data-testid="usage-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-ink dark:text-white">{t('Your plan: {name}', { name: t(s.plan?.name ?? 'Free') })}</h2>
          <PlanBadge badge={s.badge} />
        </div>
        {compact && <Button size="sm" variant="outline" href="/pro/plans">{s.badge === 'vip' ? t('Manage plan') : t('Upgrade')}</Button>}
      </div>
      <div className="mt-3 text-sm text-ink-soft dark:text-white/70">
        {limit === null ? t('Unlimited new requests. Today you received {n}.', { n: s.usedToday }) : t('New requests today: {used} of {limit}', { used: Math.min(s.usedToday, limit), limit })}
      </div>
      {limit !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunk dark:bg-white/10">
          <div className={cx('h-full rounded-full', pct >= 100 ? 'bg-accent-500' : 'bg-brand-600')} style={{ width: `${pct}%` }} />
        </div>
      )}
      {limit !== null && s.missedToday > 0 && (
        <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300" data-testid="missed">
          {t('{n} more requests matched you today, but your daily limit was reached.', { n: s.missedToday })} {compact && <Link href="/pro/plans" className="underline">{t('See plans')}</Link>}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-muted">{t('Requests customers send to you directly are always delivered and never count towards the limit.')}</p>
    </Card>
  );
}

export { Badge };
