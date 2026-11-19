'use client';

import { BadgeCheck, CalendarDays, Inbox, MessagesSquare, Star, Wallet } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { Container } from '@/components/shell';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function BecomeAPro() {
  const { t } = useT();
  const { me } = useAuth();
  const cta = me ? (me.professional ? '/pro' : '/pro/onboard') : '/register?next=/pro/onboard';
  const features = [
    [Inbox, t('Relevant requests'), t('Get notified when a customer near you needs exactly what you offer.')],
    [Wallet, t('Your price, your terms'), t('Send fixed or estimated quotes, list what is included, and revise them when needed.')],
    [CalendarDays, t('Simple calendar'), t('Set working hours, block time off and avoid double bookings automatically.')],
    [MessagesSquare, t('Built-in messaging'), t('Clarify details with customers, share photos, keep everything in one place.')],
    [BadgeCheck, t('Earn trust'), t('Identity, business and qualification badges show customers real evidence.')],
    [Star, t('Build your reputation'), t('Verified-job reviews from real customers help you win more work.')],
  ];
  return (
    <Container className="max-w-5xl">
      <div className="py-8 text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-ink dark:text-white">{t('Grow your business with UNRET')}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft dark:text-white/70">{t('Registration takes two minutes. Complete your profile at your own pace — you start receiving requests as soon as the essentials are in place.')}</p>
        <Button size="lg" className="mt-8" href={cta}>{t('Start offering services')}</Button>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(([Icon, title, text], i) => {
          const I = Icon as typeof Star;
          return (
            <Card key={i} className="p-5">
              <I className="h-6 w-6 text-brand-700" />
              <h2 className="mt-3 font-semibold text-ink dark:text-white">{title as string}</h2>
              <p className="mt-1 text-sm text-ink-muted dark:text-white/60">{text as string}</p>
            </Card>
          );
        })}
      </div>
    </Container>
  );
}
