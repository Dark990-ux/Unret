'use client';

import { useState } from 'react';
import { BadgeCheck, Building2, GraduationCap, ShieldCheck } from 'lucide-react';
import { useCategories } from '@/components/domain';
import { Alert, Button, Card, Field, FileUpload, PageHeader, PageLoader, Select, StatusBadge, Textarea } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><Verification /></ProShell>;
}

function Verification() {
  const { t, intl } = useT();
  const pro = useApi<any>('/professionals/me');
  const { flat } = useCategories();
  const [type, setType] = useState('IDENTITY');
  const [categoryId, setCategoryId] = useState('');
  const [doc, setDoc] = useState<{ key: string; name: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  if (pro.loading || !pro.data) return <PageLoader />;
  const p = pro.data;
  const types = [
    ['IDENTITY', t('Identity'), t('ID card or passport.'), BadgeCheck],
    ['BUSINESS', t('Business'), t('Trade register certificate (certificat de înregistrare) or similar.'), Building2],
    ['QUALIFICATION', t('Qualification'), t('Licence or certificate for a specific service, e.g. ANRE authorisation.'), GraduationCap],
    ['ADDITIONAL', t('Additional'), t('Other evidence, e.g. insurance or criminal record certificate.'), ShieldCheck],
  ] as const;
  const regulated = p.services.filter((s: any) => flat.find((c) => c.id === s.categoryId)?.requiredVerifications.includes('QUALIFICATION'));
  const approvedQual = (catId: string) => p.verifications.some((v: any) => v.type === 'QUALIFICATION' && v.categoryId === catId && v.status === 'APPROVED');

  const submit = async () => {
    try {
      await api('/verifications', { body: { type, categoryId: type === 'QUALIFICATION' ? categoryId : undefined, documentKey: doc!.key, notes: notes || undefined } });
      setDoc(null); setNotes('');
      setMsg({ tone: 'green', text: t('Submitted. Our team usually reviews documents within 2 working days.') });
      pro.reload();
    } catch (e) { setMsg({ tone: 'red', text: (e as Error).message }); }
  };

  return (
    <>
      <PageHeader title={t('Verification')} subtitle={t('Each badge reflects a specific type of evidence. Documents are stored privately and only seen by the UNRET verification team.')} />
      {regulated.filter((s: any) => !approvedQual(s.categoryId)).map((s: any) => (
        <div key={s.categoryId} className="mb-3"><Alert tone="amber">{t('“{name}” is a regulated service. You will receive requests for it after your qualification is verified.', { name: s.categoryName })}</Alert></div>
      ))}
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Submit a document')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {types.map(([v, l, d, Icon]) => (
              <button key={v} type="button" onClick={() => setType(v)} aria-pressed={type === v} className={`rounded-xl border p-3 text-left ${type === v ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-surface-line dark:border-white/15'}`}>
                <div className="flex items-center gap-2 font-medium text-ink dark:text-white"><Icon className="h-4 w-4 text-brand-700" />{l}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{d}</div>
              </button>
            ))}
          </div>
          {type === 'QUALIFICATION' && (
            <Field label={t('For which service?')} required>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">{t('Choose')}</option>{p.services.map((s: any) => <option key={s.categoryId} value={s.categoryId}>{s.categoryName}</option>)}</Select>
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <FileUpload purpose="verification" accept="image/jpeg,image/png,application/pdf" label={t('Upload document (PDF, JPG, PNG)')} onUploaded={(x) => setDoc(x)} />
            {doc && <span className="text-sm text-ink-soft">✓ {doc.name}</span>}
          </div>
          <Field label={t('Notes for the reviewer')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px]" placeholder={t('e.g. licence number, issuing authority')} /></Field>
          <Button disabled={!doc || (type === 'QUALIFICATION' && !categoryId)} onClick={submit}>{t('Submit for review')}</Button>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold text-ink dark:text-white">{t('Your submissions')}</h2>
          {!p.verifications.length ? <p className="text-sm text-ink-muted">{t('Nothing submitted yet.')}</p> : (
            <ul className="space-y-3">
              {p.verifications.map((v: any) => (
                <li key={v.id} className="rounded-xl border border-surface-line p-3 text-sm dark:border-white/10">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{t(v.type[0] + v.type.slice(1).toLowerCase())}{v.categoryId && ` · ${p.services.find((s: any) => s.categoryId === v.categoryId)?.categoryName ?? ''}`}</span><StatusBadge status={v.status} /></div>
                  <div className="text-xs text-ink-muted">{date(v.createdAt, intl)}</div>
                  {v.reviewNote && <div className="mt-1 text-ink-soft">{v.reviewNote}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
