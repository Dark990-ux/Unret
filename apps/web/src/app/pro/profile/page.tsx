'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CitySelect, useCategories } from '@/components/domain';
import { Alert, Avatar, Button, Card, Checkbox, Field, FileUpload, Input, Modal, PageHeader, PageLoader, Select, Textarea } from '@/components/ui-exports';
import { ProShell } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { majorToMinor } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  return <ProShell><ProfileEditor /></ProShell>;
}

function ProfileEditor() {
  const { t } = useT();
  const { reload: reloadMe } = useAuth();
  const { data: p, loading, setData } = useApi<any>('/professionals/me');
  const { flat, tree } = useCategories();
  const [f, setF] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [portfolioDraft, setPortfolioDraft] = useState<{ key: string; url: string } | null>(null);
  const [pTitle, setPTitle] = useState('');

  useEffect(() => {
    if (!p) return;
    setF({ businessName: p.businessName ?? '', headline: p.headline ?? '', biography: p.biography ?? '', experienceYears: p.experienceYears ?? '', languages: p.languages.join(', '), city: p.city ?? '', baseLat: p.baseLat, baseLng: p.baseLng, serviceRadiusKm: p.serviceRadiusKm, remoteAvailable: p.remoteAvailable });
    setServices(p.services.map((s: any) => ({ categoryId: s.categoryId, description: s.description ?? '', pricingType: s.pricingType, price: s.indicativePriceMinor != null ? String(s.indicativePriceMinor / 100) : '', isPrimary: s.isPrimary })));
  }, [p]);

  if (loading || !p || !f) return <PageLoader />;
  const flash = (tone: 'green' | 'red', text: string) => { setMsg({ tone, text }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const saveProfile = async () => {
    try {
      setData(await api('/professionals/me', { method: 'PATCH', body: {
        businessName: f.businessName || undefined, headline: f.headline, biography: f.biography,
        experienceYears: f.experienceYears === '' ? undefined : Number(f.experienceYears), languages: f.languages.split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean),
        city: f.city, baseLat: f.baseLat, baseLng: f.baseLng, serviceRadiusKm: Number(f.serviceRadiusKm), remoteAvailable: f.remoteAvailable,
      } }));
      await reloadMe();
      flash('green', t('Profile saved.'));
    } catch (e) { flash('red', (e as Error).message); }
  };
  const saveServices = async () => {
    try {
      setData(await api('/professionals/me/services', { method: 'PUT', body: { services: services.map((s) => ({ categoryId: s.categoryId, description: s.description || undefined, pricingType: s.pricingType, indicativePriceMinor: s.price ? majorToMinor(s.price) : undefined, isPrimary: s.isPrimary })) } }));
      flash('green', t('Services saved.'));
    } catch (e) { flash('red', (e as Error).message); }
  };

  return (
    <>
      <PageHeader title={t('Profile')} actions={<Button variant="outline" href={`/pros/${p.id}`}>{t('Preview')}</Button>} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="space-y-6">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Public profile')}</h2>
          <div className="flex items-center gap-4">
            <Avatar name={p.displayName} url={p.avatarUrl} size={64} />
            <FileUpload purpose="avatar" accept="image/jpeg,image/png,image/webp" label={t('Change photo or logo')} onUploaded={async (x) => { await api('/users/me', { method: 'PATCH', body: { avatarKey: x.key } }); setData(await api('/professionals/me')); }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Display / business name')}><Input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
            <Field label={t('Years of experience')}><Input type="number" min={0} max={70} value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} /></Field>
          </div>
          <Field label={t('Headline')} hint={t('One line that tells customers what you do best.')}><Input value={f.headline} maxLength={160} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
          <Field label={t('Description')} hint={t('Your services, experience, how you work. At least 50 characters.')}><Textarea value={f.biography} onChange={(e) => setF({ ...f, biography: e.target.value })} className="min-h-[160px]" /></Field>
          <Field label={t('Languages')} hint={t('Comma separated, e.g. ro, en, hu')}><Input value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Base city')}><CitySelect value={f.city} onChange={(c, lat, lng) => setF({ ...f, city: c, baseLat: lat, baseLng: lng })} /></Field>
            <Field label={t('Travel radius: {n} km', { n: f.serviceRadiusKm })}><input type="range" min={0} max={150} step={5} value={f.serviceRadiusKm} onChange={(e) => setF({ ...f, serviceRadiusKm: e.target.value })} className="w-full accent-brand-700" /></Field>
          </div>
          <Checkbox label={t('I also offer services remotely / online')} checked={f.remoteAvailable} onChange={(e) => setF({ ...f, remoteAvailable: e.target.checked })} />
          <Button onClick={saveProfile}>{t('Save profile')}</Button>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="font-semibold text-ink dark:text-white">{t('Services and indicative prices')}</h2>
          {services.map((s, i) => {
            const cat = flat.find((c) => c.id === s.categoryId);
            return (
              <div key={s.categoryId} className="space-y-3 rounded-xl border border-surface-line p-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-ink dark:text-white">{cat?.name ?? '…'} {s.isPrimary && <span className="text-xs text-brand-700">({t('main service')})</span>}</div>
                  <div className="flex gap-1">
                    {!s.isPrimary && <Button size="sm" variant="ghost" onClick={() => setServices(services.map((x, j) => ({ ...x, isPrimary: i === j })))}>{t('Make main')}</Button>}
                    {services.length > 1 && <Button size="sm" variant="ghost" onClick={() => setServices(services.filter((_, j) => j !== i))} aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <Select value={s.pricingType} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, pricingType: e.target.value } : x)))} aria-label={t('Pricing')}>
                    <option value="FIXED">{t('Fixed price')}</option><option value="HOURLY">{t('Per hour')}</option><option value="ESTIMATE">{t('Starting from')}</option><option value="ON_REQUEST">{t('On request')}</option>
                  </Select>
                  {s.pricingType !== 'ON_REQUEST' && <Input type="number" min={0} placeholder={t('Price (RON)')} value={s.price} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} aria-label={t('Price (RON)')} />}
                </div>
                <Input placeholder={t('Short description (optional)')} value={s.description} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              </div>
            );
          })}
          <Select value="" onChange={(e) => e.target.value && setServices([...services, { categoryId: e.target.value, description: '', pricingType: 'ON_REQUEST', price: '', isPrimary: false }])} aria-label={t('Add a service')}>
            <option value="">+ {t('Add a service')}</option>
            {tree.map((g) => <optgroup key={g.id} label={g.name}>{g.children.filter((c) => !services.some((s) => s.categoryId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
          </Select>
          <Button onClick={saveServices}>{t('Save services')}</Button>
        </Card>

        <Card className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink dark:text-white">{t('Portfolio')}</h2>
            <FileUpload purpose="portfolio" accept="image/jpeg,image/png,image/webp" label={t('Add photo')} onUploaded={(x) => { setPortfolioDraft(x); setPTitle(''); }} />
          </div>
          {!p.portfolio.length ? <p className="text-sm text-ink-muted">{t('Show photos of your best work.')}</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.portfolio.map((i: any) => (
                <figure key={i.id} className="group relative overflow-hidden rounded-xl bg-surface-sunk">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.url} alt={i.title} className="aspect-square w-full object-cover" />
                  <figcaption className="truncate px-2 py-1 text-xs">{i.title}</figcaption>
                  <button onClick={async () => { await api(`/professionals/me/portfolio/${i.id}`, { method: 'DELETE' }); setData({ ...p, portfolio: p.portfolio.filter((x: any) => x.id !== i.id) }); }} className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={t('Remove')}><Trash2 className="h-3.5 w-3.5" /></button>
                </figure>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!portfolioDraft} onClose={() => setPortfolioDraft(null)} title={t('Add to portfolio')}>
        {portfolioDraft && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={portfolioDraft.url} alt="" className="max-h-64 w-full rounded-xl object-contain" />
            <Field label={t('Title')} required><Input value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder={t('e.g. Bathroom renovation, Cluj')} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPortfolioDraft(null)}>{t('Cancel')}</Button>
              <Button disabled={!pTitle} onClick={async () => { const item = await api('/professionals/me/portfolio', { body: { title: pTitle, fileKey: portfolioDraft.key } }); setData({ ...p, portfolio: [item, ...p.portfolio] }); setPortfolioDraft(null); }}>{t('Add')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
