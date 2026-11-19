'use client';

import { Container } from '@/components/shell';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function HowItWorks() {
  const { t } = useT();
  const steps = [
    [t('Post your request'), t('Choose the service, describe the job, add your location, preferred date and optional budget and photos. Your exact address is only shared with the professional you hire.')],
    [t('We match professionals'), t('UNRET sends your request to a limited group of active professionals who offer the service in your area, are available and meet any required qualifications. If too few respond, the group is expanded.')],
    [t('Compare offers'), t('Each offer shows the price (fixed or estimated), what is included, materials, extra costs, proposed appointment and expiry date, alongside reviews and verification badges.')],
    [t('Hire and agree'), t('Accepting an offer creates a job agreement. Any later change of price, scope or schedule must be accepted by both sides, and the full history is kept.')],
    [t('Complete and review'), t('Both sides confirm completion. If you disagree, open a dispute and our team will help. Then leave a verified review.')],
    [t('Pay your way'), t('Pay the professional directly, or through UNRET where online payments are available. UNRET never stores your card details.')],
  ];
  return (
    <Container className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight text-ink dark:text-white">{t('How UNRET works')}</h1>
      <ol className="mt-8 space-y-4">
        {steps.map(([title, text], i) => (
          <Card key={i} className="flex gap-4 p-5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
            <div><h2 className="font-semibold text-ink dark:text-white">{title}</h2><p className="mt-1 text-sm text-ink-soft dark:text-white/70">{text}</p></div>
          </Card>
        ))}
      </ol>
    </Container>
  );
}
