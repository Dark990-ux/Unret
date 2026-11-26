'use client';

import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { upload } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { cx } from './ui';
import { useT } from '@/lib/i18n';

export const SUPPORT_CATEGORIES: [string, string, string][] = [
  ['job', '🔧', 'A job, request or offer'],
  ['payments', '💳', 'Payments and plans'],
  ['account', '👤', 'My account and login'],
  ['technical', '🐞', 'Something does not work'],
  ['safety', '🛡️', 'Safety or abuse'],
  ['suggestion', '💡', 'Idea or suggestion'],
  ['other', '💬', 'Something else'],
];

/** Screenshots or documents attached to a support message. */
export function AttachmentPicker({ keys, onChange }: { keys: { key: string; name: string }[]; onChange: (k: { key: string; name: string }[]) => void }) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {keys.map((k) => (
          <span key={k.key} className="inline-flex items-center gap-1 rounded-full bg-surface-sunk px-2.5 py-1 text-xs dark:bg-white/10">
            📎 {k.name}<button type="button" aria-label={t('Remove')} onClick={() => onChange(keys.filter((x) => x.key !== k.key))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        {keys.length < 5 && (
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-white/5">
            <Paperclip className="h-4 w-4" />{busy ? t('Uploading…') : t('Attach a screenshot or file')}
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        setBusy(true); setErr(null);
        try { const u = await upload(f, 'support' as any); onChange([...keys, { key: u.key, name: u.name ?? f.name }]); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
      }} />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}

export const ticketRef = (n: number) => `#${n}`;

/** One conversation between a person and UNRET Support. */
export function TicketThread({ t: tk, staffView }: { t: any; staffView?: boolean }) {
  const { t, intl } = useT();
  return (
    <div className="space-y-3" aria-live="polite">
      {tk.messages.map((m: any) => {
        const mineSide = staffView ? m.fromStaff : !m.fromStaff;
        return (
          <div key={m.id} className={cx('flex', mineSide ? 'justify-end' : 'justify-start')} data-testid={m.internal ? 'internal-note' : 'ticket-message'}>
            <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
              m.internal ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200'
                : mineSide ? 'rounded-br-md bg-brand-700 text-white' : 'rounded-bl-md bg-surface-sunk text-ink dark:bg-white/10 dark:text-white')}>
              <div className={cx('mb-0.5 text-xs font-semibold', mineSide && !m.internal ? 'text-white/80' : 'text-ink-muted')}>{m.internal ? `🔒 ${t('Internal note')} · ${m.author}` : m.author}</div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.attachments?.map((a: any) => <a key={a.key} href={a.url} target="_blank" rel="noreferrer" className="mt-1 block underline">📎 {a.name}</a>)}
              <div className={cx('mt-1 text-[10px]', mineSide && !m.internal ? 'text-white/70' : 'text-ink-muted')}>{dateTime(m.createdAt, intl)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

