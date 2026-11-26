'use client';

import Link from 'next/link';
import { Bug, ChevronRight, LifeBuoy, Mail, MessageCircleQuestion } from 'lucide-react';
import { Badge, Card, Container, Empty, PageHeader, PageLoader, StatusBadge } from '@/components/ui-exports';
import { ticketRef } from '@/components/support';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

const FAQ: [string, string][] = [
  ['How do I get offers for a job?', 'Post a request with a clear description and photos. Matching professionals near you send offers; you compare them and accept the one you like.'],
  ['How do payments work?', 'Pay the professional directly (card, transfer or cash) or through UNRET. Through UNRET, the money is held safely and sent to the professional when the job is done; if the job is cancelled, it is refunded.'],
  ['Something went wrong with a job. What can I do?', 'First message the other person. If you cannot agree, open the job and choose "Report a problem / dispute", or contact us below and we will step in.'],
  ['I cannot sign in.', 'Use "Forgot password?" on the sign-in page to get a link by email. If that does not help, contact us and we will help you get back in.'],
];

export default function HelpPage() {
  const { t, intl } = useT();
  const { me } = useAuth();
  const tickets = useApi<{ items: any[] }>(me ? '/support/tickets' : null);
  return (
    <Container className="max-w-4xl">
      <PageHeader title={t('Help & support')} subtitle={t('Find an answer, or write to the team that runs UNRET. We usually reply within one working day.')} />
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['/help/new?kind=question', <MessageCircleQuestion key="q" className="h-6 w-6" />, t('Ask a question'), t('About using UNRET, your account or payments.')],
          ['/help/new?kind=problem', <Bug key="b" className="h-6 w-6" />, t('Report a problem'), t('Something went wrong with a job, a payment or the app.')],
          ['/help/new?kind=contact', <Mail key="m" className="h-6 w-6" />, t('Contact us'), t('Partnerships, press, ideas or anything else.')],
        ] as const).map(([href, icon, title, text]) => (
          <Link key={href} href={href} data-testid={`help-${href.split('=')[1]}`}>
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <div className="mb-2 text-brand-700 dark:text-brand-300">{icon}</div>
              <div className="font-semibold text-ink dark:text-white">{title}</div>
              <p className="mt-1 text-sm text-ink-muted">{text}</p>
            </Card>
          </Link>
        ))}
      </div>

      {me && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Your conversations with support')}</h2>
          {tickets.loading ? <PageLoader /> : !tickets.data?.items.length ? <Empty icon={<LifeBuoy className="h-8 w-8" />} title={t('No messages yet')} text={t('When you write to us, the conversation appears here.')} /> : (
            <Card className="divide-y divide-surface-line overflow-hidden dark:divide-white/10" data-testid="my-tickets">
              {tickets.data.items.map((x) => (
                <Link key={x.id} href={`/help/tickets/${x.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-sunk/60 dark:hover:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-ink-muted">{ticketRef(x.number)}</span><span className="truncate font-medium text-ink dark:text-white">{x.subject}</span></div>
                    <div className="truncate text-sm text-ink-muted">{x.lastMessage ? `${x.lastMessage.fromStaff ? t('UNRET Support') + ': ' : t('You') + ': '}${x.lastMessage.body}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={x.status} /><span className="text-xs text-ink-muted">{timeAgo(x.lastMessageAt, intl)}</span></div>
                  <ChevronRight className="h-4 w-4 text-ink-muted" />
                </Link>
              ))}
            </Card>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Common questions')}</h2>
        <Card className="divide-y divide-surface-line dark:divide-white/10">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none font-medium text-ink marker:hidden dark:text-white">{t(q)}<span className="float-right text-ink-muted group-open:rotate-90">›</span></summary>
              <p className="mt-2 text-sm text-ink-soft dark:text-white/70">{t(a)}</p>
            </details>
          ))}
        </Card>
        <p className="mt-4 text-xs text-ink-muted"><Badge tone="red">{t('Emergency')}</Badge> {t('If someone is in danger, call 112 first.')}</p>
      </section>
    </Container>
  );
}
