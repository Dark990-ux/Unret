'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Container, PageHeader, PageLoader, StatusBadge, Textarea } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { AttachmentPicker, TicketThread, ticketRef } from '@/components/support';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function Page() {
  return <RequireAuth><Ticket /></RequireAuth>;
}

function Ticket() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { data: tk, loading, setData, reload } = useApi<any>(`/support/tickets/${id}`);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<{ key: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useRealtime<any>('support', (e) => e.ticketId === id && reload());
  if (loading || !tk) return <PageLoader />;
  const send = async () => {
    setBusy(true); setErr(null);
    try { const x: any = await api(`/support/tickets/${id}/messages`, { body: { body, attachmentKeys: files.map((f) => f.key) } }); if (x && Array.isArray(x.messages)) setData(x); else reload(); setBody(''); setFiles([]); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Container className="max-w-3xl">
      <PageHeader title={tk.subject} back={{ href: '/help', label: t('Help & support') }} subtitle={<span className="flex items-center gap-2">{ticketRef(tk.number)} <StatusBadge status={tk.status} /></span>}
        actions={!['RESOLVED', 'CLOSED'].includes(tk.status) && <Button variant="outline" onClick={() => api<any>(`/support/tickets/${id}/solved`, { method: 'POST' }).then((x) => (x && Array.isArray(x.messages) ? setData(x) : reload())).catch((x) => setErr((x as Error).message))}>{t('My problem is solved')}</Button>} />
      <Card className="space-y-5 p-5">
        <TicketThread t={tk} />
        {tk.status === 'WAITING_USER' && <Alert tone="blue">{t('UNRET Support replied. Answer below if you need anything else.')}</Alert>}
        {tk.status === 'CLOSED' ? <Alert tone="amber">{t('This conversation is closed. Please open a new one.')}</Alert> : (
          <div className="space-y-2 border-t border-surface-line pt-4 dark:border-white/10">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('Write a reply…')} aria-label={t('Reply')} className="min-h-[90px]" />
            <div className="flex flex-wrap items-center justify-between gap-2"><AttachmentPicker keys={files} onChange={setFiles} /><Button loading={busy} disabled={!body.trim()} onClick={send}>{t('Send reply')}</Button></div>
            {err && <Alert>{err}</Alert>}
          </div>
        )}
      </Card>
    </Container>
  );
}
