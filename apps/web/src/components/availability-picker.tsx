'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { WEEK, fromYmd, weekdayName, ymd } from '@/lib/availability';
import { cx } from './ui';

export type When = { mode: 'any' | 'weekdays' | 'dates'; days: number[]; dates: string[] };

const Chip = ({ on, children, onClick, testId }: { on: boolean; children: React.ReactNode; onClick: () => void; testId?: string }) => (
  <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
    className={cx('rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'border-brand-700 bg-brand-700 text-white' : 'border-surface-line hover:border-brand-400 dark:border-white/15')}>{children}</button>
);

/** "When are you available?": every day, chosen weekdays, or chosen dates (multi-select month calendar). */
export function AvailabilityPicker({ value, onChange }: { value: When; onChange: (w: When) => void }) {
  const { t, intl } = useT();
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7;
    const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);
  const toggleDay = (d: number) => onChange({ ...value, days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d] });
  const toggleDate = (s: string) => onChange({ ...value, dates: value.dates.includes(s) ? value.dates.filter((x) => x !== s) : [...value.dates, s].sort() });
  const canPrev = ymd(new Date(month.getFullYear(), month.getMonth(), 0)) >= today;

  return (
    <div className="space-y-3" data-testid="availability-picker">
      <div>
        <div className="text-sm font-medium text-ink dark:text-white">{t('When are you available?')}</div>
        <div className="text-xs text-ink-muted">{t('The days the professional can come and do the work.')}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip on={value.mode === 'any'} onClick={() => onChange({ ...value, mode: 'any' })} testId="when-any">🗓️ {t('Every day')}</Chip>
        <Chip on={value.mode === 'weekdays'} onClick={() => onChange({ ...value, mode: 'weekdays' })} testId="when-weekdays">{t('Specific days')}</Chip>
        <Chip on={value.mode === 'dates'} onClick={() => onChange({ ...value, mode: 'dates' })} testId="when-dates">📅 {t('Specific dates')}</Chip>
      </div>

      {value.mode === 'weekdays' && (
        <div className="space-y-2 rounded-xl bg-surface-sunk p-3 dark:bg-white/5">
          <div className="flex flex-wrap gap-2">{WEEK.map((d) => <Chip key={d} on={value.days.includes(d)} onClick={() => toggleDay(d)}>{weekdayName(d, intl)}</Chip>)}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => onChange({ ...value, days: [1, 2, 3, 4, 5] })}>{t('Mon–Fri')}</button>
            <button type="button" className="text-brand-700 hover:underline dark:text-brand-300" onClick={() => onChange({ ...value, days: [6, 0] })}>{t('Weekend')}</button>
          </div>
          {!value.days.length && <p className="text-xs text-ink-muted">{t('Tap the days that suit you.')}</p>}
        </div>
      )}

      {value.mode === 'dates' && (
        <div className="max-w-sm space-y-2 rounded-xl border border-surface-line p-3 dark:border-white/15">
          <div className="flex items-center justify-between">
            <button type="button" disabled={!canPrev} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-1 text-brand-700 disabled:text-surface-line" aria-label={t('Previous month')}><ChevronLeft className="h-5 w-5" /></button>
            <div className="text-sm font-semibold capitalize text-ink dark:text-white">{month.toLocaleDateString(intl, { month: 'long', year: 'numeric' })}</div>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-1 text-brand-700" aria-label={t('Next month')}><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-ink-muted">{WEEK.map((d) => <div key={d}>{weekdayName(d, intl, 'short').slice(0, 2)}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const s = ymd(d); const past = s < today; const on = value.dates.includes(s);
              return (
                <button key={s} type="button" disabled={past} onClick={() => toggleDate(s)} aria-pressed={on} data-testid={`day-${s}`}
                  aria-label={d.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long' })}
                  className={cx('h-9 rounded-full text-sm', on ? 'bg-brand-700 font-semibold text-white' : past ? 'text-surface-line dark:text-white/20' : 'hover:bg-brand-50 dark:hover:bg-white/10', s === today && !on && 'ring-1 ring-brand-600')}>{d.getDate()}</button>
              );
            })}
          </div>
          {value.dates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {value.dates.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
                  {fromYmd(s).toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short' })}
                  <button type="button" onClick={() => toggleDate(s)} aria-label={t('Remove')}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          ) : <p className="text-xs text-ink-muted">{t('Tap every day that suits you.')}</p>}
        </div>
      )}
    </div>
  );
}

export const whenOk = (w: When) => w.mode === 'any' || (w.mode === 'weekdays' ? w.days.length > 0 : w.dates.length > 0);
export const whenBody = (w: When) => ({ availabilityMode: w.mode, availableWeekdays: w.mode === 'weekdays' ? w.days : undefined, availableDates: w.mode === 'dates' ? w.dates : undefined });
