import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { DateTimeField } from '@/components/domain';
import { useTheme } from '@/components/theme';
import { Alert, Button, Card, Empty, Field, Input, KV, Loader, Row, Screen, Section, Segmented, StatusBadge, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { date, dateTime, majorToMinor, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export default function ProRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, intl } = useT();
  const { data: r, loading, reload, refresh, refreshing } = useApi<any>(`/requests/${id}`);
  const [editing, setEditing] = useState(false);
  if (loading) return <Loader />;
  if (!r) return <Screen><Empty title={t('Request not found')} /></Screen>;
  const offer = r.myOffer; const latest = offer?.revisions?.[0];
  const open = ['PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status);
  const canEdit = offer && ['PENDING', 'MODIFICATION_REQUESTED'].includes(offer.status) && open;
  const ask = async () => { const c = await api('/conversations', { body: { requestId: id } }); router.push(`/messages/${c.id}`); };

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="title">{r.title}</Text>
      <Row><StatusBadge status={r.status} /><Text variant="small">{r.categoryName}</Text></Row>
      <Card>
        <Text style={{ lineHeight: 22 }}>{r.description}</Text>
        <KV label={t('Customer')} value={r.customer.name} />
        <KV label={t('Location')} value={r.serviceMode === 'REMOTE' ? t('Remote') : `${r.addressText ? r.addressText + ', ' : ''}${r.city ?? ''}${r.match?.distanceKm != null ? ` · ${Math.round(r.match.distanceKm)} km` : ''}`} />
        {!r.addressText && r.serviceMode !== 'REMOTE' && <Text variant="small">{t('The exact address is shared once your offer is accepted.')}</Text>}
        <KV label={t('Preferred date')} value={r.preferredDate ? date(r.preferredDate, intl) : t('Flexible')} />
        <KV label={t('Budget')} value={r.budgetMaxMinor ? `≤ ${money(r.budgetMaxMinor, r.currency, intl)}` : t('Not specified')} />
        <KV label={t('Offers so far')} value={r.offerCount} />
        {r.attachments.length > 0 && <Row>{r.attachments.map((a: any) => <Image key={a.id} source={{ uri: absUrl(a.url)! }} style={{ width: 72, height: 72, borderRadius: 10 }} />)}</Row>}
      </Card>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button title={t('Ask the customer')} variant="outline" onPress={ask} style={{ flex: 1 }} />
        {!offer && open && !r.match?.declined && <Button title={t('Not interested')} variant="ghost" onPress={async () => { await api(`/requests/${id}/decline`, { method: 'POST' }); router.back(); }} />}
      </Row>
      {r.job && <Button title={t('Go to job')} onPress={() => router.push(`/jobs/${r.job.id}`)} />}

      {offer && !editing ? (
        <Section title={t('Your offer')}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}><Text variant="title">{money(latest.priceMinor, latest.currency, intl)}</Text><StatusBadge status={offer.status} /></Row>
            {offer.status === 'MODIFICATION_REQUESTED' && <Alert tone="amber">{t('The customer asked for changes. Check your messages, then revise the offer.')}</Alert>}
            <Text>{latest.description}</Text>
            {latest.proposedStartAt && <Text variant="small">📅 {dateTime(latest.proposedStartAt, intl)}</Text>}
            <Text variant="small">{t('Valid until {date}', { date: date(offer.expiresAt, intl) })} · v{offer.currentRevision}</Text>
            {canEdit && <Button title={t('Revise offer')} variant="soft" onPress={() => setEditing(true)} />}
          </Card>
        </Section>
      ) : open && !r.match?.declined ? (
        <OfferForm requestId={id} currency={r.currency} existing={editing ? { offer, latest } : null} onDone={() => { setEditing(false); reload(); }} />
      ) : <Text variant="small">{r.match?.declined ? t('You marked this request as not interesting.') : t('This request is no longer accepting offers.')}</Text>}
    </Screen>
  );
}

function OfferForm({ requestId, currency, existing, onDone }: { requestId: string; currency: string; existing: { offer: any; latest: any } | null; onDone: () => void }) {
  const { t } = useT();
  const th = useTheme();
  const l = existing?.latest;
  const [f, setF] = useState({ price: l ? String(l.priceMinor / 100) : '', priceType: l?.priceType ?? 'FIXED', description: l?.description ?? '', materialsIncluded: !!l?.materialsIncluded, materialsNote: l?.materialsNote ?? '', additionalExpenses: l?.additionalExpenses ?? '', message: '' });
  const [start, setStart] = useState<Date | null>(l?.proposedStartAt ? new Date(l.proposedStartAt) : null);
  const [hours, setHours] = useState(l?.proposedStartAt && l?.proposedEndAt ? String((new Date(l.proposedEndAt).getTime() - new Date(l.proposedStartAt).getTime()) / 36e5) : '2');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    const body = {
      priceMinor: majorToMinor(f.price), priceType: f.priceType, description: f.description.trim(), materialsIncluded: f.materialsIncluded,
      materialsNote: f.materialsNote || undefined, additionalExpenses: f.additionalExpenses || undefined, message: f.message || undefined,
      proposedStartAt: start?.toISOString(), proposedEndAt: start ? new Date(start.getTime() + (Number(hours) || 1) * 36e5).toISOString() : undefined,
    };
    try {
      if (existing) await api(`/offers/${existing.offer.id}/revise`, { body }); else await api('/offers', { body: { ...body, requestId } });
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Section title={existing ? t('Revise your offer') : t('Send an offer')}>
      <Card style={{ gap: 12 }}>
        {existing && <Alert tone="blue">{t('A new version is created; the customer sees the full history.')}</Alert>}
        <Field label={t('Price ({cur})', { cur: currency })} required><Input value={f.price} onChangeText={(price) => setF({ ...f, price })} keyboardType="decimal-pad" accessibilityLabel={t('Price ({cur})', { cur: currency })} /></Field>
        <Segmented value={f.priceType} onChange={(priceType) => setF({ ...f, priceType })} items={[{ value: 'FIXED', label: t('Fixed price') }, { value: 'ESTIMATED', label: t('Estimate') }]} />
        <Field label={t('What is included')} required><Input multiline value={f.description} onChangeText={(description) => setF({ ...f, description })} placeholder={t('Describe the work you will do for this price.')} accessibilityLabel={t('What is included')} /></Field>
        <Pressable onPress={() => setF({ ...f, materialsIncluded: !f.materialsIncluded })} accessibilityRole="checkbox" accessibilityState={{ checked: f.materialsIncluded }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: f.materialsIncluded ? th.brand : th.line, backgroundColor: f.materialsIncluded ? th.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{f.materialsIncluded && <Text style={{ color: th.onBrand, fontSize: 13 }}>✓</Text>}</View>
          <Text>{t('Materials included in the price')}</Text>
        </Pressable>
        <Field label={t('Materials notes')}><Input value={f.materialsNote} onChangeText={(materialsNote) => setF({ ...f, materialsNote })} placeholder={t('e.g. customer buys the sockets')} /></Field>
        <Field label={t('Additional expenses')}><Input value={f.additionalExpenses} onChangeText={(additionalExpenses) => setF({ ...f, additionalExpenses })} placeholder={t('e.g. transport 50 RON outside the city')} /></Field>
        <Field label={t('Proposed appointment')}><DateTimeField value={start} onChange={setStart} placeholder={t('Time to be agreed')} /></Field>
        {start && <Field label={t('Duration (hours)')}><Input value={hours} onChangeText={setHours} keyboardType="decimal-pad" /></Field>}
        {!existing && <Field label={t('Message to the customer')}><Input multiline value={f.message} onChangeText={(message) => setF({ ...f, message })} style={{ minHeight: 70 }} /></Field>}
        {err && <Alert>{err}</Alert>}
        <Button title={existing ? t('Send revised offer') : t('Send offer')} onPress={submit} loading={busy} disabled={!f.price || f.description.trim().length < 10} />
        <Text variant="small">{t('Clear offers that list what is included are accepted more often.')}</Text>
      </Card>
    </Section>
  );
}
