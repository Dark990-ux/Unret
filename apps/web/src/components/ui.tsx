'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Star, X, ImagePlus, FileText, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { upload } from '@/lib/api';
import { useT } from '@/lib/i18n';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-700/50',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-100 dark:hover:bg-brand-900/60',
  outline: 'border border-surface-line bg-white text-ink hover:bg-surface-sunk dark:bg-transparent dark:text-white dark:border-white/15 dark:hover:bg-white/5',
  ghost: 'text-ink-soft hover:bg-surface-sunk hover:text-ink dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
};

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; href?: string }>(
  function Button({ variant = 'primary', size = 'md', loading, className, children, href, disabled, ...rest }, ref) {
    const cls = cx(
      'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed whitespace-nowrap',
      size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
      VARIANTS[variant],
      className,
    );
    if (href) return <Link href={href} className={cls}>{children}</Link>;
    return (
      <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-surface-line bg-white shadow-card dark:border-white/10 dark:bg-white/[0.03]', className)} {...rest}>{children}</div>;
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string | null; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink dark:text-white">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
      {hint && !error && <span className="block text-xs text-ink-muted dark:text-white/50">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-xl border border-surface-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-surface-sunk dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'min-h-[110px] resize-y', className)} {...p} />;
});
export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputCls, 'pr-8', className)} {...p}>{children}</select>;
}
export function Checkbox({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink dark:text-white/90">
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-surface-line accent-brand-700" {...p} />
      <span>{label}</span>
    </label>
  );
}

const TONES = {
  gray: 'bg-surface-sunk text-ink-soft dark:bg-white/10 dark:text-white/70',
  green: 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  blue: 'bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  red: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  violet: 'bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children, className, icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONES[tone], className)}>{icon}{children}</span>;
}

const STATUS: Record<string, [string, Tone]> = {
  DRAFT: ['Draft', 'gray'], PUBLISHED: ['Waiting for offers', 'blue'], OFFERS_RECEIVED: ['Offers received', 'violet'],
  OFFER_ACCEPTED: ['Offer accepted', 'green'], CANCELLED: ['Cancelled', 'gray'], EXPIRED: ['Expired', 'gray'],
  PENDING: ['Pending', 'amber'], MODIFICATION_REQUESTED: ['Changes requested', 'amber'], ACCEPTED: ['Accepted', 'green'],
  REJECTED: ['Rejected', 'red'], WITHDRAWN: ['Withdrawn', 'gray'], SCHEDULED: ['Scheduled', 'blue'],
  IN_PROGRESS: ['In progress', 'violet'], COMPLETED: ['Completed', 'green'], DISPUTED: ['Disputed', 'red'],
  APPROVED: ['Approved', 'green'], OPEN: ['Open', 'amber'], IN_REVIEW: ['In review', 'blue'], UNDER_REVIEW: ['Under review', 'blue'],
  RESOLVED: ['Resolved', 'green'], DISMISSED: ['Dismissed', 'gray'], ACTIVE: ['Active', 'green'], SUSPENDED: ['Suspended', 'red'],
  DELETED: ['Deleted', 'gray'], HIDDEN: ['Hidden', 'gray'], LIMITED: ['Limited', 'amber'], PUBLIC: ['Public', 'green'],
  RECORDED: ['Recorded', 'gray'], SUCCEEDED: ['Paid', 'green'], FAILED: ['Failed', 'red'], REFUNDED: ['Refunded', 'gray'],
  PARTIALLY_REFUNDED: ['Partially refunded', 'amber'], PROPOSED: ['Awaiting approval', 'amber'],
};
export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const [label, tone] = STATUS[status] ?? [status, 'gray' as Tone];
  return <Badge tone={tone}>{t(label)}</Badge>;
}

export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} aria-label={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} width={size} height={size} className={i <= Math.round(value) ? 'fill-accent-600 text-accent-600 dark:fill-accent-500 dark:text-accent-500' : 'fill-transparent text-ink-muted/40'} />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-ink dark:text-white/90">{label}</span>
      <span className="inline-flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button type="button" key={i} role="radio" aria-checked={value === i} aria-label={`${i}`} onClick={() => onChange(i)} className="rounded p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <Star className={cx('h-6 w-6', i <= value ? 'fill-accent-600 text-accent-600 dark:fill-accent-500 dark:text-accent-500' : 'text-ink-muted/40')} />
          </button>
        ))}
      </span>
    </div>
  );
}

export function Avatar({ name, url, size = 40, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className={cx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-100', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-brand-700', className)} />;
}

export function PageLoader() {
  return <div className="flex min-h-[40vh] items-center justify-center"><Spinner className="h-7 w-7" /></div>;
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-line px-6 py-12 text-center dark:border-white/10">
      {icon && <div className="mb-3 text-ink-muted">{icon}</div>}
      <p className="font-medium text-ink dark:text-white">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-muted dark:text-white/50">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'green' | 'blue' | 'amber'; children: React.ReactNode }) {
  const map = {
    red: ['border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200', AlertCircle],
    green: ['border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-100', CheckCircle2],
    blue: ['border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100', Info],
    amber: ['border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100', AlertCircle],
  } as const;
  const [cls, Icon] = map[tone];
  return <div role={tone === 'red' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', cls)}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl dark:bg-[#14152b] sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-surface-sunk dark:hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link href={back.href} className="mb-2 inline-block text-sm text-ink-muted hover:text-brand-700 dark:text-white/50">← {back.label}</Link>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white sm:text-[1.7rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted dark:text-white/60">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="inline-flex gap-1 rounded-xl bg-surface-sunk p-1 dark:bg-white/5">
        {items.map((i) => (
          <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
            className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', value === i.value ? 'bg-white text-ink shadow-sm dark:bg-white/15 dark:text-white' : 'text-ink-muted hover:text-ink dark:text-white/60 dark:hover:text-white')}>
            {i.label}{i.count !== undefined && <span className="ml-1.5 text-xs opacity-70">{i.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-sm text-ink-muted dark:text-white/60"><span>{label}</span>{icon}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-ink dark:text-white">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted dark:text-white/50">{hint}</div>}
    </Card>
  );
}

/** Uploads files via /files and returns storage keys. */
export function FileUpload({ purpose, onUploaded, accept = 'image/*', multiple, label }: {
  purpose: Parameters<typeof upload>[1]; onUploaded: (f: { key: string; name: string; url: string; mime: string }) => void; accept?: string; multiple?: boolean; label?: string;
}) {
  const { t } = useT();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setBusy(true);
    setErr(null);
    try {
      for (const f of files) onUploaded(await upload(f, purpose));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-surface-line px-4 py-2.5 text-sm text-ink-soft hover:border-brand-600 hover:text-brand-700 dark:border-white/20 dark:text-white/70">
        {busy ? <Spinner className="h-4 w-4" /> : accept.includes('pdf') ? <FileText className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        {label ?? t('Add files')}
      </label>
      <input id={id} type="file" className="sr-only" accept={accept} multiple={multiple} onChange={onChange} disabled={busy} />
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

export function KeyValue({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-ink-muted dark:text-white/50">{k}</dt>
          <dd className="mt-0.5 break-words font-medium text-ink dark:text-white">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
