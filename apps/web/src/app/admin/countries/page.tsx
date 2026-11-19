'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, PageLoader } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Countries /></AdminShell>;
}

function Countries() {
  const { t } = useT();
  const { data, loading, reload } = useApi<any[]>('/admin/countries');
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <PageHeader title={t('Countries')} subtitle={t('Country, currency, language, time zone and platform fee configuration.')} actions={<Button onClick={() => { setErr(null); setEdit({ code: '', name: '', currency: 'EUR', defaultLanguage: 'en', defaultTimezone: 'Europe/', phonePrefix: '+', isActive: false, platformFeeBps: 1000, isNew: true }); }}>{t('Add country')}</Button>} />
      <div className="mb-4"><Alert tone="amber">{t('Activating a country requires local legal review, payment provider support and category configuration first.')}</Alert></div>
      {loading ? <PageLoader /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-ink-muted"><tr className="border-b border-surface-line dark:border-white/10">{[t('Code'), t('Name'), t('Currency'), t('Language'), t('Time zone'), t('Phone'), t('Platform fee'), t('Status'), ''].map((h, i) => <th key={i} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {data?.map((c) => (
                <tr key={c.code} className="border-b border-surface-line last:border-0 dark:border-white/10">
                  <td className="p-3 font-mono">{c.code}</td><td className="p-3">{c.name}</td><td className="p-3">{c.currency}</td><td className="p-3">{c.defaultLanguage}</td><td className="p-3">{c.defaultTimezone}</td><td className="p-3">{c.phonePrefix}</td>
                  <td className="p-3">{(c.platformFeeBps / 100).toFixed(2)}%</td>
                  <td className="p-3">{c.isActive ? <Badge tone="green">{t('Active')}</Badge> : <Badge>{t('Inactive')}</Badge>}</td>
                  <td className="p-3"><Button size="sm" variant="outline" onClick={() => { setErr(null); setEdit(c); }}>{t('Edit')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? t('Add country') : t('Edit country')}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('ISO code')}><Input value={edit.code} maxLength={2} disabled={!edit.isNew} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
              <Field label={t('Name')}><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label={t('Currency')}><Input value={edit.currency} maxLength={3} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} /></Field>
              <Field label={t('Default language')}><Input value={edit.defaultLanguage} onChange={(e) => setEdit({ ...edit, defaultLanguage: e.target.value })} /></Field>
              <Field label={t('Time zone')}><Input value={edit.defaultTimezone} onChange={(e) => setEdit({ ...edit, defaultTimezone: e.target.value })} /></Field>
              <Field label={t('Phone prefix')}><Input value={edit.phonePrefix} onChange={(e) => setEdit({ ...edit, phonePrefix: e.target.value })} /></Field>
              <Field label={t('Platform fee (%)')}><Input type="number" min={0} max={50} step="0.01" value={edit.platformFeeBps / 100} onChange={(e) => setEdit({ ...edit, platformFeeBps: Math.round(Number(e.target.value) * 100) })} /></Field>
            </div>
            <Checkbox label={t('Active (open for registrations)')} checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>{t('Cancel')}</Button>
              <Button onClick={async () => { try { const { isNew, createdAt, updatedAt, ...body } = edit; await api('/admin/countries', { method: 'PUT', body }); setEdit(null); reload(); } catch (e) { setErr((e as Error).message); } }}>{t('Save')}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
