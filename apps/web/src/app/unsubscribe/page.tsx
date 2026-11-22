'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MailX } from 'lucide-react';
import { Card, Container, PageLoader } from '@/components/ui-exports';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

/** Opened from the link at the bottom of every notification email. Works without signing in. */
export default function Page() {
  const { t } = useT();
  const [state, setState] = useState<{ ok: boolean; email?: string | null } | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    api<any>('/notifications/unsubscribe', { method: 'POST', body: { token } }).then(setState).catch(() => setState({ ok: false }));
  }, []);
  return (
    <Container className="max-w-lg py-16">
      <Card className="space-y-3 p-8 text-center">
        {!state ? <PageLoader /> : state.ok ? (
          <>
            <MailX className="mx-auto h-10 w-10 text-brand-700" />
            <h1 className="text-xl font-semibold text-ink dark:text-white">{t('Email notifications turned off')}</h1>
            <p className="text-ink-soft dark:text-white/70">{t('We won’t send notification emails to {email} anymore. You still see notifications in the app.', { email: state.email ?? '' })}</p>
            <p className="text-sm text-ink-muted">{t('Changed your mind?')} <Link href="/settings#notifications" className="font-medium text-brand-700 hover:underline">{t('Turn them on again in Settings')}</Link></p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-ink dark:text-white">{t('This link is not valid')}</h1>
            <p className="text-ink-soft dark:text-white/70">{t('You can turn email notifications off in Settings.')}</p>
            <Link href="/settings#notifications" className="font-medium text-brand-700 hover:underline">{t('Go to Settings')}</Link>
          </>
        )}
      </Card>
    </Container>
  );
}
