'use client';

import { BadgeCheck, Building2, GraduationCap, ShieldCheck } from 'lucide-react';
import { Container } from '@/components/shell';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function Trust() {
  const { t } = useT();
  const levels = [
    [BadgeCheck, t('Identity verified'), t('The professional’s identity document has been checked by our team.')],
    [Building2, t('Business verified'), t('The company’s registration with the trade register has been checked.')],
    [GraduationCap, t('Qualification verified'), t('A relevant professional qualification or licence (for example an ANRE authorisation for electricians) has been checked for that specific service.')],
    [ShieldCheck, t('Additional checks'), t('Other category-specific evidence, where appropriate.')],
  ];
  return (
    <Container className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight text-ink dark:text-white">{t('Verification & trust')}</h1>
      <p className="mt-3 text-ink-soft dark:text-white/70">{t('Each badge on UNRET represents a specific type of evidence. A qualification badge is never given just because someone verified their identity.')}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {levels.map(([Icon, title, text], i) => {
          const I = Icon as typeof ShieldCheck;
          return <Card key={i} className="p-5"><I className="h-6 w-6 text-brand-700" /><h2 className="mt-3 font-semibold text-ink dark:text-white">{title as string}</h2><p className="mt-1 text-sm text-ink-muted dark:text-white/60">{text as string}</p></Card>;
        })}
      </div>
      <h2 className="mt-10 text-xl font-semibold text-ink dark:text-white">{t('Reviews you can rely on')}</h2>
      <p className="mt-2 text-sm text-ink-soft dark:text-white/70">{t('Only customers who completed a job through UNRET can leave a verified-job review, once per job. Professionals can respond publicly. Our team investigates reported reviews.')}</p>
      <h2 className="mt-8 text-xl font-semibold text-ink dark:text-white">{t('Fair ranking')}</h2>
      <p className="mt-2 text-sm text-ink-soft dark:text-white/70">{t('Search results and request matching are based on relevance, location, availability, reliability and rating. Paid plans never override qualification requirements or push irrelevant professionals ahead.')}</p>
    </Container>
  );
}
