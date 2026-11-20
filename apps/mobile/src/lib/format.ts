import { formatMoney } from '@unret/shared';
export const money = (m: number | null | undefined, c = 'RON', l = 'ro-RO') => formatMoney(m, c, l);
export const majorToMinor = (v: string) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && v !== '' ? Math.round(n * 100) : undefined; };
export const date = (d: string | Date | null | undefined, l = 'ro-RO') => (d ? new Date(d).toLocaleDateString(l, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d: string | Date | null | undefined, l = 'ro-RO') => (d ? new Date(d).toLocaleString(l, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export function timeAgo(d: string | Date, l = 'ro-RO') {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(l, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
  return date(d, l);
}

/** "20 Dec" or "20 Dec → 25 Dec" for a preferred date or period. */
export function period(from: string | null | undefined, to: string | null | undefined, l = 'ro-RO') {
  if (!from) return null;
  const f = (d: string) => new Date(d).toLocaleDateString(l, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return to && to.slice(0, 10) !== from.slice(0, 10) ? `${f(from)} → ${f(to)}` : f(from);
}
