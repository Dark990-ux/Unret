import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert as RNAlert, View } from 'react-native';
import { Rating, VerificationBadges } from '@/components/domain';
import { Alert, Avatar, Badge, Button, Card, Divider, Empty, Field, Input, KV, Loader, Row, Screen, Section, Segmented, Sheet, StatusBadge, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { date, dateTime, money, period } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, intl } = useT();
  const req = useApi<any>(`/requests/${id}`);
  const isOwner = req.data && req.data.viewer !== 'professional';
  const offers = useApi<any[]>(isOwner ? `/offers/request/${id}` : null);
  const [accepting, setAccepting] = useState<any | null>(null);
  const [modifying, setModifying] = useState<any | null>(null);
  const [payment, setPayment] = useState<'DIRECT' | 'PLATFORM'>('DIRECT');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useRealtime('notification', (n: any) => n.data?.requestId === id && (req.reload(), offers.reload()));

  if (req.loading || !req.data) return <Loader />;
  const r = req.data;
  if (r.viewer === 'professional') { router.replace(`/pro/requests/${id}`); return <Loader />; }
  const open = ['PUBLISHED', 'OFFERS_RECEIVED'].includes(r.status);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); await Promise.all([req.reload(), offers.reload()]); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const confirm = (title: string, onYes: () => void) => {
    if (typeof window !== 'undefined' && (window as any).confirm) { if ((window as any).confirm(title)) onYes(); return; }
    RNAlert.alert(title, undefined, [{ text: t('Cancel'), style: 'cancel' }, { text: t('Confirm'), onPress: onYes }]);
  };

  return (
    <Screen onRefresh={() => { req.refresh(); offers.refresh(); }} refreshing={req.refreshing}>
      <Text variant="title">{r.title}</Text>
      <Row><StatusBadge status={r.status} /><Text variant="small">{r.categoryName}</Text></Row>
      {r.directTo && <Badge tone="sun">✦ {t('Sent directly to {name}', { name: r.directTo.name })}</Badge>}
      {err && <Alert>{err}</Alert>}
      {r.status === 'DRAFT' && <Button title={t('Publish request')} onPress={() => run(() => api(`/requests/${id}/publish`, { method: 'POST' }))} loading={busy} />}
      {r.job && <Button title={t('Go to job')} onPress={() => router.push(`/jobs/${r.job.id}`)} />}

      <Section title={`${t('Offers')} (${offers.data?.length ?? 0})`}>
        {r.status === 'DRAFT' ? <Empty title={t('This request is a draft')} text={t('Publish it to start receiving offers.')} /> :
          offers.loading ? <Loader /> : !offers.data?.length ? <Empty title={t('Waiting for offers')} text={r.directTo ? t('{name} has been notified. You will be notified as soon as they send a quote.', { name: r.directTo.name }) : t('We have notified matching professionals in your area. You will be notified as soon as an offer arrives.')} /> :
          offers.data.map((o) => {
            const p = o.professional; const l = o.latest;
            return (
              <Card key={o.id}>
                <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }} gap={10}>
                  <Avatar name={p.displayName} url={absUrl(p.avatarUrl)} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="label" onPress={() => router.push(`/pros/${p.id}`)}>{p.displayName}</Text>
                    <Rating avg={p.ratingAvg} count={p.ratingCount} />
                    {p.completedJobs > 0 && <Text variant="small">{t('{n} jobs completed', { n: p.completedJobs })}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text variant="h2">{money(l.priceMinor, l.currency, intl)}</Text>
                    <Text variant="small">{l.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')}</Text>
                    <StatusBadge status={o.expired ? 'EXPIRED' : o.status} />
                  </View>
                </Row>
                <VerificationBadges badges={p.badges} />
                <Text>{l.description}</Text>
                <Text variant="small">📦 {l.materialsIncluded ? t('Materials included') : t('Materials not included')}{l.materialsNote ? ` — ${l.materialsNote}` : ''}</Text>
                {l.additionalExpenses && <Text variant="small">+ {t('Additional costs')}: {l.additionalExpenses}</Text>}
                <Text variant="small">📅 {l.proposedStartAt ? t('Proposed: {date}', { date: dateTime(l.proposedStartAt, intl) }) : p.nextAvailable?.length ? t('Next free: {date}', { date: dateTime(p.nextAvailable[0], intl) }) : t('Time to be agreed')}</Text>
                <Text variant="small">⏱ {t('Valid until {date}', { date: date(o.expiresAt, intl) })}{o.currentRevision > 1 ? ` · ${t('Revised (v{n})', { n: o.currentRevision })}` : ''}</Text>
                {l.message && <Text variant="small">“{l.message}”</Text>}
                <Divider />
                {o.status === 'PENDING' && !o.expired && open && <Button title={t('Accept offer')} onPress={() => setAccepting(o)} />}
                <Row style={{ flexWrap: 'nowrap' }}>
                  {o.status === 'PENDING' && !o.expired && open && <Button small variant="outline" title={t('Request changes')} onPress={() => setModifying(o)} style={{ flex: 1 }} />}
                  <Button small variant="outline" title={t('Ask a question')} style={{ flex: 1 }} onPress={async () => { const c = await api('/conversations', { body: { professionalId: p.id, requestId: id } }); router.push(`/messages/${c.id}`); }} />
                </Row>
                {['PENDING', 'MODIFICATION_REQUESTED'].includes(o.status) && open && <Button small variant="ghost" title={t('Decline')} onPress={() => confirm(t('Decline this offer?'), () => run(() => api(`/offers/${o.id}/reject`, { body: {} })))} />}
              </Card>
            );
          })}
      </Section>

      <Section title={t('Request details')}>
        <Card>
          <Text>{r.description}</Text>
          <KV label={t('Location')} value={r.serviceMode === 'REMOTE' ? t('Remote') : [r.addressText, r.city].filter(Boolean).join(', ')} />
          <KV label={t('Preferred date')} value={period(r.preferredDate, r.preferredDateTo, intl) ?? t('Flexible')} />
          <KV label={t('Budget')} value={r.budgetMaxMinor ? money(r.budgetMaxMinor, r.currency, intl) : t('Not specified')} />
          {open && <KV label={t('Open until')} value={date(r.expiresAt, intl)} />}
        </Card>
      </Section>
      {(open || r.status === 'DRAFT') && <Button variant="ghost" title={t('Cancel request')} onPress={() => confirm(t('Cancel this request? Pending offers will be declined.'), () => run(() => api(`/requests/${id}/cancel`, { body: {} })))} />}

      <Sheet open={!!accepting} onClose={() => setAccepting(null)} title={t('Accept this offer?')}>
        {accepting && (<>
          <Alert tone="blue">{t('Accepting creates a job agreement for {price} with {name}. Other offers will be declined. Any later change to price or scope must be approved by both of you.', { price: money(accepting.latest.priceMinor, accepting.latest.currency, intl), name: accepting.professional.displayName })}</Alert>
          <Field label={t('How will you pay?')}>
            <Segmented value={payment} onChange={setPayment} items={[{ value: 'DIRECT', label: t('Directly to the professional') }, { value: 'PLATFORM', label: t('Online through UNRET') }]} />
          </Field>
          {payment === 'DIRECT' && <Text variant="small">{t('UNRET records the agreed price and payment method but does not process or guarantee direct payments.')}</Text>}
          <Button title={t('Accept offer')} loading={busy} onPress={async () => {
            const o = accepting; setBusy(true); setErr(null);
            try { const job = await api(`/offers/${o.id}/accept`, { body: { revision: o.currentRevision, paymentMethod: payment } }); setAccepting(null); router.replace(`/jobs/${job.id}`); }
            catch (e) { setErr((e as Error).message); setAccepting(null); } finally { setBusy(false); }
          }} />
        </>)}
      </Sheet>
      <Sheet open={!!modifying} onClose={() => setModifying(null)} title={t('Request changes to the offer')}>
        <Field label={t('What would you like changed?')}><Input multiline value={msg} onChangeText={setMsg} placeholder={t('e.g. Could you include materials? Is Saturday possible?')} /></Field>
        <Button title={t('Send')} disabled={msg.trim().length < 5} onPress={() => { const o = modifying; setModifying(null); run(() => api(`/offers/${o.id}/request-modification`, { body: { message: msg } })).then(() => setMsg('')); }} />
      </Sheet>
    </Screen>
  );
}
