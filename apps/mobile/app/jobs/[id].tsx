import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { DateTimeField } from '@/components/domain';
import { PaymentFollowUp, PaymentPanel } from '@/components/payment';
import { useTheme } from '@/components/theme';
import { Alert, Avatar, Badge, Button, Card, Divider, Empty, Field, Input, KV, Loader, Row, Screen, Section, Segmented, Sheet, StarInput, StatusBadge, Text } from '@/components/ui';
import { absUrl, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, majorToMinor, money } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

const STEPS = ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];
const STATUS_NAMES: Record<string, string> = { ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed' };
const EVENT_NAMES: Record<string, string> = {
  CREATED: 'Job created from accepted offer', CONFIRMED: 'Completion confirmed', CHANGE_PROPOSED: 'Change proposed', CHANGE_ACCEPTED: 'Change accepted', CHANGE_REJECTED: 'Change declined',
  DISPUTE_OPENED: 'Dispute opened', DISPUTE_RESOLVED: 'Dispute resolved', AUTO_COMPLETED: 'Completed automatically',
  PAYMENT_SUCCEEDED: 'Paid through UNRET (held until the job is done)', PAYMENT_MARKED_PAID: 'Customer says the payment was sent',
  PAYMENT_CONFIRMED: 'Professional confirmed receiving the payment', PAYOUT_SENT: 'Payment sent to the professional',
  PAYMENT_REFUNDED: 'Payment refunded to the customer', PAYMENT_METHOD_CHANGED: 'Payment method changed', PAYMENT_REMINDER: 'Payment reminder sent', PAYMENT_ESCALATED: 'Sent to the UNRET team to check the payment', PAYMENT_FOLLOW_UP_CLOSED: 'Payment complete — reminders stopped', PAYMENT_RECORDED: 'Payment recorded',
};
type SheetKind = null | 'change' | 'cancel' | 'dispute' | 'review' | 'payment';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, intl } = useT();
  const th = useTheme();
  const { me } = useAuth();
  const { data: j, loading, reload, setData, refresh, refreshing } = useApi<any>(`/jobs/${id}`);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useRealtime('notification', (n: any) => n.data?.jobId === id && reload());
  const act = async (path: string, body: unknown = {}) => {
    setBusy(true); setErr(null);
    try { setData(await api(path, { method: 'POST', body })); setSheet(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (loading) return <Loader />;
  if (!j) return <Screen><Empty title={t('Job not found')} /></Screen>;
  const can = (a: string) => j.allowedActions.includes(a);
  const isCustomer = j.viewerRole === 'customer';
  const other = isCustomer ? { name: j.professional.displayName, url: absUrl(j.professional.avatarUrl), phone: j.professional.user.phone } : { name: j.customer.name, url: absUrl(j.customer.avatarUrl), phone: j.customer.phone };
  const pending = j.changes.find((c: any) => c.status === 'PROPOSED');
  const step = STEPS.indexOf(j.status);

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <Text variant="title">{j.request.title}</Text>
      <Row><StatusBadge status={j.status} /><Text variant="small">{j.categoryName}</Text></Row>
      {!['CANCELLED', 'DISPUTED'].includes(j.status) && (
        <Row style={{ flexWrap: 'nowrap' }} gap={4}>{STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? th.brand : th.line }} />)}</Row>
      )}
      {err && <Alert>{err}</Alert>}
      {j.status === 'DISPUTED' && <Alert tone="amber">{t('This job is in dispute. The UNRET team is reviewing it and will contact both parties.')}</Alert>}
      {j.status === 'IN_PROGRESS' && j.professionalConfirmedAt && !j.customerConfirmedAt && (
        <Alert tone="blue">{isCustomer ? t('The professional marked the job as finished. Please confirm, or open a dispute if something is wrong. Without a response the job completes automatically after 7 days.') : t('Waiting for the customer to confirm completion.')}</Alert>
      )}
      {j.status === 'IN_PROGRESS' && j.customerConfirmedAt && !j.professionalConfirmedAt && (
        <Alert tone="blue">{isCustomer ? t('Waiting for the professional to confirm completion.') : t('The customer confirmed the job is finished. Please confirm completion.')}</Alert>
      )}

      {can('start') && <Button title={t('Start work')} onPress={() => act(`/jobs/${id}/start`)} loading={busy} />}
      {can('confirm_completion') && <Button title={isCustomer ? t('Confirm job is done') : t('Mark job as finished')} onPress={() => act(`/jobs/${id}/confirm-completion`)} loading={busy} />}
      {can('review') && <Button title={`★ ${t('Leave a review')}`} onPress={() => setSheet('review')} />}

      {pending && (
        <Card style={{ borderColor: th.amber, borderWidth: 1 }}>
          <Text variant="h2">{t('Proposed change to the agreement')}</Text>
          <Text variant="small">{t('Proposed by {name}', { name: pending.proposedBy.name })}: “{pending.reason}”</Text>
          {pending.priceMinor != null && <Text>{t('Price')}: {money(pending.previous.priceMinor, j.currency, intl)} → {money(pending.priceMinor, j.currency, intl)}</Text>}
          {pending.scope && <Text>{t('New scope')}: {pending.scope}</Text>}
          {pending.scheduledStartAt && <Text>{t('Appointment')}: {dateTime(pending.scheduledStartAt, intl)}</Text>}
          {pending.proposedBy.id === me?.id ? (
            <Row><Badge tone="amber">{t('Waiting for the other party')}</Badge><Button small variant="ghost" title={t('Withdraw')} onPress={() => act(`/jobs/${id}/changes/${pending.id}/withdraw`)} /></Row>
          ) : (
            <Row style={{ flexWrap: 'nowrap' }}>
              <Button small title={t('Accept change')} onPress={() => act(`/jobs/${id}/changes/${pending.id}/respond`, { decision: 'accept' })} style={{ flex: 1 }} />
              <Button small variant="outline" title={t('Decline')} onPress={() => act(`/jobs/${id}/changes/${pending.id}/respond`, { decision: 'reject' })} style={{ flex: 1 }} />
            </Row>
          )}
        </Card>
      )}

      <Card>
        <Row style={{ flexWrap: 'nowrap' }} gap={12}>
          <Avatar name={other.name} url={other.url} />
          <View style={{ flex: 1 }}><Text variant="label">{other.name}</Text><Text variant="small">{isCustomer ? t('Professional') : t('Customer')}</Text></View>
          {other.phone && <Button small variant="outline" title="📞" onPress={() => Linking.openURL(`tel:${other.phone}`)} />}
          {j.conversationId && <Button small variant="outline" title="✉" onPress={() => router.push(`/messages/${j.conversationId}`)} />}
        </Row>
      </Card>

      <Section title={t('Agreement')}>
        <Card>
          <KV label={t('Agreed price')} value={`${money(j.agreedPriceMinor, j.currency, intl)} (${j.priceType === 'FIXED' ? t('Fixed price') : t('Estimate')})`} />
          <KV label={t('Appointment')} value={j.scheduledStartAt ? dateTime(j.scheduledStartAt, intl) : t('To be agreed — propose a time')} />
          <KV label={t('Location')} value={j.request.serviceMode === 'REMOTE' ? t('Remote') : [j.request.addressText, j.request.city].filter(Boolean).join(', ')} />
          
          <Divider />
          <Text variant="small">{t('Scope of work')}</Text>
          <Text>{j.scope}</Text>
          <Text variant="small">{j.acceptedRevision.materialsIncluded ? t('Materials included') : t('Materials not included')}</Text>
          {can('propose_change') && !pending && <Button small variant="soft" title={t('Propose a change')} onPress={() => setSheet('change')} />}
        </Card>
      </Section>

      <Section title={t('Payment')}>
        <PaymentFollowUp job={j} />
        <PaymentPanel job={j} onUpdated={setData} />
      </Section>

      {j.review && <Section title={t('Review')}><Card><Text style={{ color: th.star }}>{'★'.repeat(j.review.overall)}</Text>{j.review.text && <Text>{j.review.text}</Text>}<Badge tone="green">{t('Verified job')}</Badge></Card></Section>}

      <Section title={t('Timeline')}>
        <Card>{j.events.map((e: any) => <View key={e.id}><Text variant="label">{e.toStatus ? `${t('Status')}: ${t(STATUS_NAMES[e.toStatus] ?? e.toStatus)}` : t(EVENT_NAMES[e.type] ?? e.type)}</Text><Text variant="small">{dateTime(e.createdAt, intl)}{e.actor ? ` · ${e.actor.name}` : ''}{e.note ? ` — ${e.note}` : ''}</Text></View>)}</Card>
      </Section>

      <Section title={t('Need help?')}>
        {can('cancel') && <Button variant="outline" title={t('Cancel job')} onPress={() => setSheet('cancel')} />}
        {can('open_dispute') && <Button variant="outline" title={t('Report a problem / dispute')} onPress={() => setSheet('dispute')} />}
        <Button variant="ghost" title={`🛟 ${t('Contact UNRET support')}`} onPress={() => router.push({ pathname: '/help/new', params: { kind: 'problem', jobId: j.id, subject: j.request.title } })} />
      </Section>

      <ChangeSheet open={sheet === 'change'} onClose={() => setSheet(null)} job={j} busy={busy} onSubmit={(b) => act(`/jobs/${id}/changes`, b)} />
      <ReasonSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} title={t('Cancel job')} warning={t('Cancelling affects your reliability on UNRET. The other party will be notified.')} label={t('Reason for cancelling')} onSubmit={(reason) => act(`/jobs/${id}/cancel`, { reason })} />
      <ReasonSheet open={sheet === 'dispute'} onClose={() => setSheet(null)} title={t('Open a dispute')} warning={t('Try to resolve the issue by message first. A dispute pauses the job until our team reviews it.')} label={t('What is the problem?')} onSubmit={(reason) => act(`/jobs/${id}/disputes`, { reason: reason.slice(0, 200), details: reason })} />
      <ReviewSheet open={sheet === 'review'} onClose={() => setSheet(null)} onSubmit={async (b) => { await api('/reviews', { body: { ...b, jobId: id } }); setSheet(null); reload(); }} />
    </Screen>
  );
}

function ChangeSheet({ open, onClose, job, busy, onSubmit }: { open: boolean; onClose: () => void; job: any; busy: boolean; onSubmit: (b: any) => void }) {
  const { t } = useT();
  const [price, setPrice] = useState('');
  const [start, setStart] = useState<Date | null>(null);
  const [hours, setHours] = useState('2');
  const [scope, setScope] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t('Propose a change')}>
      <Alert tone="blue">{t('Changes only take effect when the other party accepts them. The original agreement is kept in the history.')}</Alert>
      <Field label={t('New price ({cur})', { cur: job.currency })} hint={t('Leave empty to keep the current price.')}><Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" /></Field>
      <Field label={t('Appointment start')}><DateTimeField value={start} onChange={setStart} /></Field>
      {start && <Field label={t('Duration (hours)')}><Input value={hours} onChangeText={setHours} keyboardType="decimal-pad" /></Field>}
      <Field label={t('New scope')} hint={t('Optional. Describe the full updated scope.')}><Input multiline value={scope} onChangeText={setScope} /></Field>
      <Field label={t('Reason')} required><Input value={reason} onChangeText={setReason} placeholder={t('e.g. Extra socket requested on site')} /></Field>
      <Button title={t('Send proposal')} loading={busy} disabled={reason.length < 5 || (!price && !start && !scope)} onPress={() => onSubmit({
        priceMinor: price ? majorToMinor(price) : undefined, scope: scope || undefined, reason,
        scheduledStartAt: start?.toISOString(), scheduledEndAt: start ? new Date(start.getTime() + (Number(hours) || 1) * 36e5).toISOString() : undefined,
      })} />
    </Sheet>
  );
}

function ReasonSheet({ open, onClose, title, warning, label, onSubmit }: { open: boolean; onClose: () => void; title: string; warning: string; label: string; onSubmit: (r: string) => void }) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Alert tone="amber">{warning}</Alert>
      <Field label={label} required><Input multiline value={reason} onChangeText={setReason} /></Field>
      <Button variant="danger" title={t('Confirm')} disabled={reason.trim().length < 5} onPress={() => onSubmit(reason.trim())} />
    </Sheet>
  );
}

function ReviewSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const { t } = useT();
  const [f, setF] = useState({ overall: 0, communication: 0, quality: 0, punctuality: 0, text: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet open={open} onClose={onClose} title={t('Review this job')}>
      <StarInput label={t('Overall')} value={f.overall} onChange={(overall) => setF({ ...f, overall })} />
      <StarInput label={t('Communication')} value={f.communication} onChange={(communication) => setF({ ...f, communication })} />
      <StarInput label={t('Quality of work')} value={f.quality} onChange={(quality) => setF({ ...f, quality })} />
      <StarInput label={t('Punctuality')} value={f.punctuality} onChange={(punctuality) => setF({ ...f, punctuality })} />
      <Field label={t('Your feedback')} hint={t('Optional. Be honest and specific — it helps others.')}><Input multiline value={f.text} onChangeText={(text) => setF({ ...f, text })} /></Field>
      {err && <Alert>{err}</Alert>}
      <Button title={t('Publish review')} disabled={!f.overall || !f.communication || !f.quality || !f.punctuality} onPress={() => onSubmit({ ...f, text: f.text || undefined }).catch((e) => setErr(e.message))} />
    </Sheet>
  );
}
