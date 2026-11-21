'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Paperclip, Send } from 'lucide-react';
import { Alert, Button, Card, Container, Empty, PageLoader, StatusBadge, cx } from '@/components/ui-exports';
import { RequireAuth } from '@/components/shell';
import { ReportButton } from '@/components/report';
import { api, upload } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useT } from '@/lib/i18n';
import { emitRealtime, useRealtime } from '@/lib/realtime';
import { ConversationList } from '@/components/conversations';

export default function Page() {
  return <RequireAuth><Thread /></RequireAuth>;
}

function Thread() {
  const { id } = useParams<{ id: string }>();
  const { t, intl } = useT();
  const { me } = useAuth();
  const { data, loading, setData } = useApi<{ conversation: any; messages: any[]; hasMore?: boolean; otherLastReadAt?: string | null }>(`/conversations/${id}/messages`);
  const [typing, setTyping] = useState(false);
  const [older, setOlder] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastTypingSent = useRef(0);
  const keepBottom = useRef(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (keepBottom.current) bottom.current?.scrollIntoView({ block: 'end' }); keepBottom.current = true; }, [data?.messages.length, typing]);
  useRealtime<any>('message', (m) => {
    if (m.conversationId !== id) return;
    setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
    if (!m.mine) { setTyping(false); api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => undefined); }
  });
  useRealtime<any>('read', (e) => { if (e.conversationId === id) setData((d) => (d ? { ...d, otherLastReadAt: e.readAt } : d)); });
  useRealtime<any>('typing', (e) => {
    if (e.conversationId !== id) return;
    setTyping(e.typing);
    clearTimeout(typingTimer.current);
    if (e.typing) typingTimer.current = setTimeout(() => setTyping(false), 6000);
  });
  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - lastTypingSent.current > 2500) { lastTypingSent.current = now; emitRealtime('typing', { conversationId: id, typing: true }); }
  };
  const loadOlder = async () => {
    if (!data?.messages.length) return;
    setOlder(true);
    try {
      const r = await api<any>(`/conversations/${id}/messages`, { query: { before: data.messages[0].createdAt } });
      keepBottom.current = false;
      setData((d) => (d ? { ...d, hasMore: r.hasMore, messages: [...r.messages.filter((m: any) => !d.messages.some((x) => x.id === m.id)), ...d.messages] } : d));
    } catch (e) { setErr((e as Error).message); } finally { setOlder(false); }
  };

  const send = async (attachmentKey?: string) => {
    if (!text.trim() && !attachmentKey) return;
    setSending(true);
    setErr(null);
    try {
      const m = await api(`/conversations/${id}/messages`, { body: { body: text, attachmentKey } });
      setText('');
      lastTypingSent.current = 0;
      emitRealtime('typing', { conversationId: id, typing: false });
      setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, { ...m, mine: true }] } : d));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const up = await upload(f, 'message');
      await send(up.key);
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const c = data?.conversation;
  const isCustomer = c && me && c.customer.id === me.id;
  const other = c ? (isCustomer ? c.professional.businessName ?? c.professional.user.name : c.customer.name) : '';
  const msgs: any[] = data?.messages ?? [];
  const seenAt = data?.otherLastReadAt ? new Date(data.otherLastReadAt).getTime() : 0;
  const lastMine = [...msgs].reverse().find((m) => m.mine && m.kind !== 'SYSTEM');
  const dayOf = (d: string) => new Date(d).toDateString();
  const dayLabel = (d: string) => {
    const x = new Date(d), today = new Date(), y = new Date(Date.now() - 864e5);
    if (x.toDateString() === today.toDateString()) return t('Today');
    if (x.toDateString() === y.toDateString()) return t('Yesterday');
    return x.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long', ...(x.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  };

  return (
    <Container className="max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="hidden lg:block"><ConversationList activeId={id} /></div>
        <Card className="flex h-[calc(100vh-10rem)] min-h-[480px] flex-col overflow-hidden">
          {loading ? <PageLoader /> : !c ? <Empty title={t('Conversation not found')} /> : (
            <>
              <div className="flex items-center gap-3 border-b border-surface-line px-4 py-3 dark:border-white/10">
                <Link href="/messages" className="rounded-lg p-1 lg:hidden" aria-label={t('Back')}><ArrowLeft className="h-5 w-5" /></Link>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink dark:text-white">{isCustomer ? <Link href={`/pros/${c.professional.id}`} className="hover:text-brand-700">{other}</Link> : other}</div>
                  {c.request && <div className="truncate text-xs text-ink-muted">{c.request.title}</div>}
                </div>
                {c.job ? <Link href={`/jobs/${c.job.id}`}><StatusBadge status={c.job.status} /></Link> : c.request && <Link href={isCustomer ? `/requests/${c.request.id}` : `/pro/requests/${c.request.id}`} className="text-sm text-brand-700">{t('View request')}</Link>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                {data!.hasMore && <div className="text-center"><Button size="sm" variant="ghost" loading={older} onClick={loadOlder}>{t('Load earlier messages')}</Button></div>}
                {!msgs.length && <p className="py-10 text-center text-sm text-ink-muted">{t('Say hello to {name}. Messages are private between the two of you.', { name: other })}</p>}
                {msgs.map((m, i) => <Fragment key={m.id}>
                  {(i === 0 || dayOf(msgs[i - 1].createdAt) !== dayOf(m.createdAt)) && <div className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-ink-muted" data-testid="day-separator">{dayLabel(m.createdAt)}</div>}
                  {m.kind === 'SYSTEM' ? (
                  <div className="text-center text-xs text-ink-muted"><span className="rounded-full bg-surface-sunk px-3 py-1 dark:bg-white/5">{m.body}</span></div>
                ) : (
                  <div className={cx('flex', m.mine ? 'justify-end' : 'justify-start')}>
                    <div className={cx('group max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.mine ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md bg-surface-sunk text-ink dark:bg-white/10 dark:text-white')}>
                      {m.attachmentUrl && (m.attachmentMime === 'application/pdf'
                        ? <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="mb-1 block underline">📄 {m.attachmentName}</a>
                        // eslint-disable-next-line @next/next/no-img-element
                        : <a href={m.attachmentUrl} target="_blank" rel="noreferrer"><img src={m.attachmentUrl} alt="" className="mb-1 max-h-60 rounded-lg" /></a>)}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div className={cx('mt-0.5 flex items-center gap-2 text-[10px]', m.mine ? 'text-white/70' : 'text-ink-muted')}>
                        {new Date(m.createdAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' })}
                        {m.mine && <span aria-label={new Date(m.createdAt).getTime() <= seenAt ? t('Seen') : t('Sent')} title={new Date(m.createdAt).getTime() <= seenAt ? t('Seen') : t('Sent')}>{new Date(m.createdAt).getTime() <= seenAt ? '✓✓' : '✓'}</span>}
                        {!m.mine && <span className="opacity-0 group-hover:opacity-100"><ReportButton targetType="MESSAGE" targetId={m.id} small /></span>}
                      </div>
                    </div>
                  </div>
                )}
                  {m === lastMine && new Date(m.createdAt).getTime() <= seenAt && <div className="-mt-2 text-right text-[11px] text-ink-muted" data-testid="seen">{t('Seen')}</div>}
                </Fragment>)}
                {typing && <div className="flex justify-start" data-testid="typing"><div className="rounded-2xl rounded-bl-md bg-surface-sunk px-3.5 py-2 text-sm text-ink-muted dark:bg-white/10">{t('{name} is typing…', { name: other })}</div></div>}
                <div ref={bottom} />
              </div>
              {err && <div className="px-4"><Alert>{err}</Alert></div>}
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-surface-line p-3 dark:border-white/10">
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg p-2 text-ink-muted hover:bg-surface-sunk dark:hover:bg-white/5" aria-label={t('Attach file')}><Paperclip className="h-5 w-5" /></button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={onFile} />
                <label className="sr-only" htmlFor="msg">{t('Message')}</label>
                <textarea id="msg" value={text} onChange={(e) => onType(e.target.value)} rows={1} placeholder={t('Write a message…')}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-surface-line bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none dark:border-white/15 dark:bg-white/5" />
                <Button type="submit" loading={sending} disabled={!text.trim()} aria-label={t('Send')}><Send className="h-4 w-4" /></Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </Container>
  );
}
