'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Alert, Button, Field, Modal, Select, Textarea } from './ui';

export function ReportButton({ targetType, targetId, small }: { targetType: 'USER' | 'PROFILE' | 'REQUEST' | 'REVIEW' | 'MESSAGE'; targetId: string; small?: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reasons = [t('Fake or misleading'), t('Inappropriate content'), t('Fraud or scam'), t('Harassment'), t('Other')];
  const submit = async () => {
    try {
      await api('/reports', { body: { targetType, targetId, reason, details: details || undefined } });
      setDone(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className={small ? 'inline-flex items-center gap-1 text-xs text-ink-muted hover:text-red-600' : 'inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-red-600'}>
        <Flag className={small ? 'h-3 w-3' : 'h-4 w-4'} />{t('Report')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('Report a problem')}>
        {done ? (
          <div className="space-y-4"><Alert tone="green">{t('Thank you. Our team will review your report.')}</Alert><Button onClick={() => setOpen(false)}>{t('Close')}</Button></div>
        ) : (
          <div className="space-y-4">
            <Field label={t('Reason')} required>
              <Select value={reason} onChange={(e) => setReason(e.target.value)}><option value="">{t('Choose a reason')}</option>{reasons.map((r) => <option key={r}>{r}</option>)}</Select>
            </Field>
            <Field label={t('Details')}><Textarea value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>{t('Cancel')}</Button><Button variant="danger" disabled={!reason} onClick={submit}>{t('Send report')}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
