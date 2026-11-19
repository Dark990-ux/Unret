import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { CategorySelect, CitySelect, DateTimeField, useCategories, useUploader } from '@/components/domain';
import { Alert, Button, Card, Chip, Field, Input, Row, Screen, Segmented, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { majorToMinor } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { CITIES } from '@unret/shared';

export default function NewRequest() {
  const { t } = useT();
  const { me } = useAuth();
  const params = useLocalSearchParams<{ category?: string }>();
  const { flat } = useCategories();
  const [f, setF] = useState({ categoryId: params.category ?? '', title: '', description: '', serviceMode: 'ON_SITE', city: me?.city ?? '', lat: undefined as number | undefined, lng: undefined as number | undefined, addressText: me?.addressText ?? '', budgetMax: '', urgency: 'NORMAL', timeWindow: '' });
  const [date, setDate] = useState<Date | null>(null);
  const [files, setFiles] = useState<{ key: string; url: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const up = useUploader('request');
  const cat = useMemo(() => flat.find((c) => c.id === f.categoryId), [flat, f.categoryId]);
  useEffect(() => { if (f.city && f.lat === undefined) { const c = CITIES.find((x) => x.name === f.city); if (c) setF((s) => ({ ...s, lat: c.lat, lng: c.lng })); } }, [f.city]);

  const submit = async (publish: boolean) => {
    setBusy(true); setErr(null);
    try {
      const remote = f.serviceMode === 'REMOTE';
      const r = await api('/requests', { body: {
        categoryId: f.categoryId, title: f.title.trim(), description: f.description.trim(), serviceMode: f.serviceMode,
        city: remote ? undefined : f.city, lat: remote ? undefined : f.lat, lng: remote ? undefined : f.lng, addressText: remote ? undefined : f.addressText || undefined,
        preferredDate: date?.toISOString(), preferredTimeWindow: f.timeWindow || undefined, budgetMaxMinor: majorToMinor(f.budgetMax), urgency: f.urgency,
        attachmentKeys: files.map((x) => x.key), publish,
      } });
      router.replace(`/requests/${r.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen>
      <Text variant="small">{t('Free and without obligation. Matching professionals will send you offers.')}</Text>
      <Card>
        <Text variant="h2">1. {t('What do you need?')}</Text>
        <Field label={t('Service')} required><CategorySelect value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId, serviceMode: 'ON_SITE' })} /></Field>
        {cat?.requiredVerifications.includes('QUALIFICATION') && <Alert tone="blue">{t('This service is regulated. Your request will only be sent to professionals with a verified qualification.')}</Alert>}
        <Field label={t('Title')} hint={t('e.g. “Install 5 new sockets in the living room”')} required><Input value={f.title} onChangeText={(title) => setF({ ...f, title })} maxLength={140} accessibilityLabel={t('Title')} /></Field>
        <Field label={t('Description')} hint={t('Describe the job: what, how much, any details that help professionals quote accurately.')} required><Input multiline value={f.description} onChangeText={(description) => setF({ ...f, description })} accessibilityLabel={t('Description')} /></Field>
        <Text variant="label">{t('Photos or documents')}</Text>
        <Row>
          {files.map((x) => <Image key={x.key} source={{ uri: absUrl(x.url)! }} style={{ width: 64, height: 64, borderRadius: 10 }} />)}
          <Button small variant="outline" title={t('Add photos')} loading={up.busy} onPress={async () => { const r = await up.pickImage(); if (r) setFiles((s) => [...s, r]); }} />
        </Row>
        {up.error && <Alert>{up.error}</Alert>}
      </Card>
      <Card>
        <Text variant="h2">2. {t('Where?')}</Text>
        {cat?.remoteAllowed && <Segmented value={f.serviceMode} onChange={(serviceMode) => setF({ ...f, serviceMode })} items={[{ value: 'ON_SITE', label: t('At my location') }, { value: 'REMOTE', label: t('Remote / online') }, { value: 'EITHER', label: t('Either is fine') }]} />}
        {f.serviceMode !== 'REMOTE' && (
          <>
            <Field label={t('City')} required><CitySelect value={f.city} onChange={(city, lat, lng) => setF({ ...f, city, lat, lng })} /></Field>
            <Field label={t('Address')} hint={t('Only shared with the professional you hire.')}><Input value={f.addressText} onChangeText={(addressText) => setF({ ...f, addressText })} autoComplete="street-address" /></Field>
          </>
        )}
      </Card>
      <Card>
        <Text variant="h2">3. {t('When and budget')}</Text>
        <Field label={t('Preferred date')}><DateTimeField mode="date" value={date} onChange={setDate} placeholder={t('Flexible')} /></Field>
        <Row gap={6}>{[['', t('Flexible')], ['morning', t('Morning')], ['afternoon', t('Afternoon')], ['evening', t('Evening')]].map(([v, l]) => <Chip key={v} label={l} selected={f.timeWindow === v} onPress={() => setF({ ...f, timeWindow: v })} />)}</Row>
        <Field label={t('Urgency')}>
          <Segmented value={f.urgency} onChange={(urgency) => setF({ ...f, urgency })} items={[{ value: 'LOW', label: t('Not urgent') }, { value: 'NORMAL', label: t('Normal') }, { value: 'HIGH', label: t('Soon') }, { value: 'EMERGENCY', label: t('Emergency') }]} />
        </Field>
        <Field label={t('Budget up to (RON)')} hint={t('Optional')}><Input value={f.budgetMax} onChangeText={(budgetMax) => setF({ ...f, budgetMax })} keyboardType="decimal-pad" /></Field>
      </Card>
      {err && <Alert>{err}</Alert>}
      <Button title={t('Publish request')} onPress={() => submit(true)} loading={busy} disabled={!f.categoryId || f.title.length < 5 || f.description.length < 20} />
      <Button title={t('Save as draft')} variant="ghost" onPress={() => submit(false)} disabled={busy || !f.categoryId || f.title.length < 5} />
      <View style={{ height: 20 }} />
    </Screen>
  );
}
