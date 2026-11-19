'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, PageLoader, Textarea } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { majorToMinor, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Plans /></AdminShell>;
}

function Plans() {
  const { t, intl } = useT();
  const { data, loading, reload } = useApi<any[]>('/subscriptions/admin/plans');
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    try {
      const body = { code: edit.code, name: edit.name, countryCode: edit.countryCode, priceMinor: majorToMinor(edit.price), currency: edit.currency, isActive: edit.isActive, features: JSON.parse(edit.features || '{}') };
      await api(edit.id ? `/subscriptions/admin/plans/${edit.id}` : '/subscriptions/admin/plans', { method: edit.id ? 'PUT' : 'POST', body });
      setEdit(null); reload();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <>
      <PageHeader title={t('Subscription plans')} actions={<Button onClick={() => { setErr(null); setEdit({ code: '', name: '', countryCode: 'RO', price: '0', currency: 'RON', isActive: true, features: '{}' }); }}>{t('New plan')}</Button>} />
      <div className="mb-4"><Alert tone="blue">{t('Plans must never influence matching or search ranking.')}</Alert></div>
      {loading ? <PageLoader /> : (
        <div className="grid gap-3 md:grid-cols-3">
          {data?.map((p) => (
            <Card key={p.id} className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between"><b className="text-base">{p.name}</b>{!p.isActive && <Badge tone="gray">{t('Inactive')}</Badge>}</div>
              <div>{money(p.priceMinor, p.currency, intl)} · {p.countryCode} · <code>{p.code}</code></div>
              <div className="text-ink-muted">{t('{n} active subscribers', { n: p._count.subscriptions })}</div>
              <pre className="overflow-x-auto rounded-lg bg-surface-sunk p-2 text-xs dark:bg-white/5">{JSON.stringify(p.features, null, 1)}</pre>
              <Button size="sm" variant="outline" onClick={() => { setErr(null); setEdit({ ...p, price: String(p.priceMinor / 100), features: JSON.stringify(p.features, null, 2) }); }}>{t('Edit')}</Button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Edit plan') : t('New plan')}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Code')}><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
              <Field label={t('Name')}><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label={t('Country')}><Input value={edit.countryCode} maxLength={2} onChange={(e) => setEdit({ ...edit, countryCode: e.target.value.toUpperCase() })} /></Field>
              <Field label={t('Currency')}><Input value={edit.currency} maxLength={3} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} /></Field>
              <Field label={t('Monthly price')}><Input type="number" min={0} step="0.01" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
            </div>
            <Field label={t('Features (JSON)')}><Textarea className="font-mono text-xs" value={edit.features} onChange={(e) => setEdit({ ...edit, features: e.target.value })} /></Field>
            <Checkbox label={t('Active')} checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>{t('Cancel')}</Button><Button onClick={save}>{t('Save')}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
