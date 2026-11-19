'use client';

import { useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, Empty, Field, Input, Modal, PageHeader, PageLoader, StatusBadge, Tabs, Textarea } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Queue /></AdminShell>;
}

function Queue() {
  const { t, intl, locale } = useT();
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const { data, loading, reload } = useApi<{ items: any[]; total: number }>('/verifications/queue', { status, pageSize: 50 });
  const [deciding, setDeciding] = useState<{ v: any; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const openDoc = async (id: string) => { const { url } = await api(`/verifications/${id}/document`); window.open(url, '_blank', 'noopener'); };
  const catName = (c: any) => c?.translations.find((x: any) => x.locale === locale)?.name ?? c?.slug;
  return (
    <>
      <PageHeader title={t('Verification queue')} subtitle={t('Check that the document matches the claimed type. A qualification must relate to the specific service.')} />
      <Tabs value={status} onChange={setStatus} items={[{ value: 'PENDING', label: t('Pending') }, { value: 'APPROVED', label: t('Approved') }, { value: 'REJECTED', label: t('Rejected') }]} />
      {loading ? <PageLoader /> : !data?.items.length ? <Empty icon={<ShieldCheck className="h-8 w-8" />} title={t('Queue is empty')} /> : (
        <div className="space-y-3">
          {data.items.map((v) => (
            <Card key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <div className="font-medium text-ink dark:text-white">{v.type}{v.category && ` · ${catName(v.category)}`} — {v.professional.businessName ?? v.professional.user.name}</div>
                <div className="text-ink-muted">{v.professional.user.email} · {v.professional.accountType}{v.professional.company && ` · ${v.professional.company.legalName} (${v.professional.company.registrationNumber})`} · {dateTime(v.createdAt, intl)}</div>
                {v.notes && <div className="mt-1 text-ink-soft">“{v.notes}”</div>}
                {v.reviewedBy && <div className="mt-1 text-xs text-ink-muted">{t('Reviewed by {name}', { name: v.reviewedBy.name })}{v.reviewNote && `: ${v.reviewNote}`}</div>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openDoc(v.id)}><ExternalLink className="h-3.5 w-3.5" />{t('Open document')}</Button>
                {v.status === 'PENDING' ? (<>
                  <Button size="sm" onClick={() => { setDeciding({ v, decision: 'APPROVED' }); setNote(''); }}>{t('Approve')}</Button>
                  <Button size="sm" variant="danger" onClick={() => { setDeciding({ v, decision: 'REJECTED' }); setNote(''); }}>{t('Reject')}</Button>
                </>) : <StatusBadge status={v.status} />}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.decision === 'APPROVED' ? t('Approve verification') : t('Reject verification')}>
        <div className="space-y-4">
          <Field label={deciding?.decision === 'REJECTED' ? t('Reason (shown to the professional)') : t('Note (optional)')} required={deciding?.decision === 'REJECTED'}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {deciding?.decision === 'APPROVED' && <Field label={t('Expires on (optional)')} hint={t('For licences with an expiry date.')}><Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></Field>}
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeciding(null)}>{t('Cancel')}</Button>
            <Button variant={deciding?.decision === 'REJECTED' ? 'danger' : 'primary'} onClick={async () => {
              try { await api(`/verifications/${deciding!.v.id}/decision`, { body: { decision: deciding!.decision, note: note || undefined, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined } }); setDeciding(null); setExpiresAt(''); reload(); } catch (e) { setErr((e as Error).message); }
            }}>{t('Confirm')}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
