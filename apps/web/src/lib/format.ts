import { formatMoney } from '@unret/shared';

export const money = (minor: number | null | undefined, currency = 'RON', locale = 'ro-RO') => formatMoney(minor, currency, locale);

export function majorToMinor(v: string | number) {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export function dateTime(d: string | Date | null | undefined, locale = 'ro-RO') {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(d: string | Date | null | undefined, locale = 'ro-RO') {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale, { dateStyle: 'medium' });
}

export function timeAgo(d: string | Date, locale = 'ro-RO') {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.round(diff), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return date(d, locale);
}

/** Value for <input type="datetime-local"> from an ISO string (local time). */
export function toLocalInput(d: string | Date | null | undefined) {
  if (!d) return '';
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : undefined;
}

export function responseTime(minutes: number | null | undefined) {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}
