'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, PageLoader, Select } from '@/components/ui-exports';
import { AdminShell } from '@/components/shell';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <AdminShell><Categories /></AdminShell>;
}

const VTYPES = ['IDENTITY', 'BUSINESS', 'QUALIFICATION', 'ADDITIONAL'];

function Categories() {
  const { t } = useT();
  const { data, loading, reload } = useApi<any[]>('/admin/categories');
  const [edit, setEdit] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (loading || !data) return <PageLoader />;
  const roots = data.filter((c) => !c.parentId);
  const name = (c: any, l: string) => c.translations.find((x: any) => x.locale === l)?.name ?? '';
  const open = (c: any | null, parentId: string | null = null) => {
    setErr(null);
    setEdit(c ? { id: c.id, slug: c.slug, parentId: c.parentId, icon: c.icon ?? '', sortOrder: c.sortOrder, isActive: c.isActive, remoteAllowed: c.remoteAllowed, requiredVerifications: c.requiredVerifications, ro: name(c, 'ro'), en: name(c, 'en'), roActive: c.countries.find((x: any) => x.countryCode === 'RO')?.isActive ?? false }
      : { id: null, slug: '', parentId, icon: '', sortOrder: 0, isActive: true, remoteAllowed: false, requiredVerifications: [], ro: '', en: '', roActive: true });
  };
  const save = async () => {
    try {
      const body = { slug: edit.slug, parentId: edit.parentId || null, icon: edit.icon || undefined, sortOrder: Number(edit.sortOrder), isActive: edit.isActive, remoteAllowed: edit.remoteAllowed, requiredVerifications: edit.requiredVerifications,
        translations: [{ locale: 'ro', name: edit.ro }, { locale: 'en', name: edit.en }], countries: [{ countryCode: 'RO', isActive: edit.roActive }] };
      await api(edit.id ? `/admin/categories/${edit.id}` : '/admin/categories', { method: edit.id ? 'PUT' : 'POST', body });
      setEdit(null);
      reload();
    } catch (e) { setErr((e as Error).message); }
  };
  const Row = ({ c, child }: { c: any; child?: boolean }) => (
    <div className={`flex items-center justify-between gap-2 py-2.5 ${child ? 'pl-8' : ''}`}>
      <div className="min-w-0 text-sm">
        <span className={child ? '' : 'font-semibold'}>{c.icon} {name(c, 'en')}</span> <span className="text-ink-muted">/ {name(c, 'ro')} · {c.slug}</span>
        <span className="ml-2 inline-flex gap-1">{!c.isActive && <Badge tone="red">{t('Inactive')}</Badge>}{c.remoteAllowed && <Badge>{t('Remote')}</Badge>}{c.requiredVerifications.map((v: string) => <Badge key={v} tone="violet">{v}</Badge>)}</span>
      </div>
      <div className="flex shrink-0 gap-1">
        {!child && <Button size="sm" variant="ghost" onClick={() => open(null, c.id)}><Plus className="h-3.5 w-3.5" /></Button>}
        <Button size="sm" variant="outline" onClick={() => open(c)}>{t('Edit')}</Button>
      </div>
    </div>
  );
  return (
    <>
      <PageHeader title={t('Service categories')} subtitle={t('Changes apply immediately — no app release needed.')} actions={<Button onClick={() => open(null)}><Plus className="h-4 w-4" />{t('New category')}</Button>} />
      <Card className="divide-y divide-surface-line px-4 dark:divide-white/10">
        {roots.map((r) => <div key={r.id}><Row c={r} />{data.filter((c) => c.parentId === r.id).map((c) => <Row key={c.id} c={c} child />)}</div>)}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Edit category') : t('New category')} wide>
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('Name (English)')} required><Input value={edit.en} onChange={(e) => setEdit({ ...edit, en: e.target.value })} /></Field>
              <Field label={t('Name (Romanian)')} required><Input value={edit.ro} onChange={(e) => setEdit({ ...edit, ro: e.target.value })} /></Field>
              <Field label={t('Slug')} hint="a-z, 0-9, -" required><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></Field>
              <Field label={t('Parent')}><Select value={edit.parentId ?? ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}><option value="">{t('— top level —')}</option>{roots.filter((r) => r.id !== edit.id).map((r) => <option key={r.id} value={r.id}>{name(r, 'en')}</option>)}</Select></Field>
              <Field label={t('Icon (emoji)')}><Input value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} /></Field>
              <Field label={t('Sort order')}><Input type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <Checkbox label={t('Active')} checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
              <Checkbox label={t('Available in Romania')} checked={edit.roActive} onChange={(e) => setEdit({ ...edit, roActive: e.target.checked })} />
              <Checkbox label={t('Can be delivered remotely')} checked={edit.remoteAllowed} onChange={(e) => setEdit({ ...edit, remoteAllowed: e.target.checked })} />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t('Mandatory verifications for professionals')}</legend>
              <div className="flex flex-wrap gap-4">{VTYPES.map((v) => <Checkbox key={v} label={v} checked={edit.requiredVerifications.includes(v)} onChange={(e) => setEdit({ ...edit, requiredVerifications: e.target.checked ? [...edit.requiredVerifications, v] : edit.requiredVerifications.filter((x: string) => x !== v) })} />)}</div>
            </fieldset>
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>{t('Cancel')}</Button><Button disabled={!edit.slug || !edit.en || !edit.ro} onClick={save}>{t('Save')}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
