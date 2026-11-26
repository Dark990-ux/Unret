'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, Container, Field, Input, PageHeader, Textarea, cx } from '@/components/ui-exports';
import { AttachmentPicker, SUPPORT_CATEGORIES } from '@/components/support';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <Suspense><NewTicket /></Suspense>;
}

function NewTicket() {
  const { t } = useT();
  const { me } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const kind = (sp.get('kind') as 'question' | 'problem' | 'contact') || 'question';
  const jobId = sp.get('jobId') ?? undefined, requestId = sp.get('requestId') ?? undefined, paymentId = sp.get('paymentId') ?? undefined;
  const [category, setCategory] = useState(sp.get('category') ?? (jobId || requestId ? 'job' : paymentId ? 'payments' : kind === 'problem' ? 'technical' : ''));
  const [f, setF] = useState({ subject: sp.get('subject') ?? '', message: '', name: '', email: '', website: '' });
  const [files, setFiles] = useState<{ key: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const title = kind === 'problem' ? t('Report a problem') : kind === 'contact' ? t('Contact us') : t('Ask a question');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (me) {
        const tk = await api<any>('/support/tickets', { body: { kind, category, subject: f.subject, message: f.message, jobId, requestId, paymentId, pageUrl: sp.get('from') ?? undefined, attachmentKeys: files.map((x) => x.key) } });
        router.push(`/help/tickets/${tk.id}`);
      } else {
        const r = await api<any>('/support/contact', { body: { name: f.name, email: f.email, category, subject: f.subject, message: f.message, website: f.website } });
        setSent(r.number ?? 0);
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  if (sent !== null) return (
    <Container className="max-w-xl py-16"><Card className="space-y-3 p-8 text-center">
      <div className="text-4xl">✅</div>
      <h1 className="text-xl font-semibold text-ink dark:text-white">{t('Thank you! We received your message.')}</h1>
      <p className="text-ink-soft dark:text-white/70">{t('We will reply to {email}, usually within one working day.', { email: f.email })}{sent ? ` ${t('Reference')}: #${sent}` : ''}</p>
    </Card></Container>
  );

  return (
    <Container className="max-w-2xl">
      <PageHeader title={title} back={{ href: '/help', label: t('Help & support') }} subtitle={kind === 'problem' ? t('Tell us what happened and we will look into it. Screenshots help a lot.') : t('Write to the team that runs UNRET.')} />
      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          {(jobId || requestId || paymentId) && <Alert tone="blue">{t('This message will be linked to the {what} you came from, so we can see the details.', { what: jobId ? t('job') : requestId ? t('request') : t('payment') })}</Alert>}
          <div>
            <div className="mb-2 text-sm font-medium text-ink dark:text-white">{t('What is it about?')} <span className="text-red-600">*</span></div>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {SUPPORT_CATEGORIES.map(([v, icon, l]) => (
                <button key={v} type="button" role="radio" aria-checked={category === v} onClick={() => setCategory(v)} data-testid={`cat-${v}`}
                  className={cx('flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm', category === v ? 'border-2 border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-surface-line hover:border-brand-400 dark:border-white/15')}>
                  <span aria-hidden>{icon}</span>{t(l)}
                </button>
              ))}
            </div>
            {category === 'safety' && <p className="mt-2 text-xs text-red-700">{t('Safety reports go to the top of our queue. If someone is in danger, call 112 first.')}</p>}
          </div>
          {!me && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Your name')} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} autoComplete="name" /></Field>
              <Field label={t('Your email')} required hint={t('We reply to this address.')}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" /></Field>
            </div>
          )}
          <Field label={t('Subject')} required><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required minLength={3} maxLength={140} placeholder={kind === 'problem' ? t('e.g. The professional did not show up') : t('In a few words')} /></Field>
          <Field label={t('Message')} required hint={kind === 'problem' ? t('What happened, when, and what you expected. Include the job or request name if you have one.') : undefined}>
            <Textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} required minLength={10} className="min-h-[140px]" />
          </Field>
          {me && <AttachmentPicker keys={files} onChange={setFiles} />}
          {/* Hidden from people; bots fill it in. */}
          <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end"><Button type="submit" size="lg" loading={busy} disabled={!category}>{t('Send')}</Button></div>
        </form>
      </Card>
    </Container>
  );
}
