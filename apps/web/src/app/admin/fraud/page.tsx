'use client';

import Link from 'next/link';
import { Card, Empty, PageHeader, PageLoader } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Fraud /></AdminShell>;
}

function Fraud() {
  const { t } = useT();
  const { data, loading } = useApi<any>('/admin/fraud');
  if (loading || !data) return <PageLoader />;
  const Section = ({ title, hint, rows, render }: { title: string; hint: string; rows: any[]; render: (r: any) => React.ReactNode }) => (
    <Card className="p-5">
      <h2 className="font-semibold text-ink dark:text-white">{title}</h2>
      <p className="mb-3 text-xs text-ink-muted">{hint}</p>
      {!rows.length ? <p className="text-sm text-ink-muted">{t('Nothing flagged.')}</p> : <ul className="space-y-1.5 text-sm">{rows.map((r, i) => <li key={i}>{render(r)}</li>)}</ul>}
    </Card>
  );
  return (
    <>
      <PageHeader title={t('Risk indicators')} subtitle={t('Simple, explainable signals for manual review. Not automatic decisions.')} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t('High cancellation rate')} hint={t('Professionals with ≥2 cancellations and >30% of jobs cancelled by them.')} rows={data.highCancellationProfessionals}
          render={(r) => <><Link href={`/pros/${r.id}`} className="text-brand-700">{r.name}</Link> — {r.cancelledJobs} {t('cancelled')} / {r.completedJobs} {t('completed')}</>} />
        <Section title={t('Repeatedly reported')} hint={t('Targets with 2+ open reports.')} rows={data.repeatedlyReportedTargets} render={(r) => <>{r.targetType} <code className="text-xs">{r.targetId}</code> — {r.reports} {t('reports')}</>} />
        <Section title={t('Repeated reviews from the same customer')} hint={t('3+ reviews for the same professional in 30 days may indicate fake jobs.')} rows={data.repeatedReviewsSamePair}
          render={(r) => <><Link href={`/admin/users/${r.customerId}`} className="text-brand-700">{t('Customer')}</Link> → <Link href={`/pros/${r.professionalId}`} className="text-brand-700">{t('Professional')}</Link>: {r.reviews}</>} />
        <Section title={t('Suspension reasons')} hint={t('Distribution of reasons for suspended accounts.')} rows={data.suspensionReasons} render={(r) => <>{r.reason ?? '—'}: {r.n}</>} />
      </div>
      {!data && <Empty title="" />}
    </>
  );
}
