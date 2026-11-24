/** Text for "when the customer is available" on a request (app). */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** Monday first; values use 0 = Sunday … 6 = Saturday. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];
export const weekdayName = (n: number, intl: string, style: 'short' | 'long' = 'short') => new Date(2024, 0, 7 + n).toLocaleDateString(intl, { weekday: style });

export function describeAvailability(r: { availabilityMode?: string | null; availableWeekdays?: number[]; availableDates?: string[] }, t: (s: string, v?: Record<string, string | number>) => string, intl: string): string | null {
  if (r.availabilityMode === 'any') return t('Every day');
  if (r.availabilityMode === 'weekdays' && r.availableWeekdays?.length) return WEEK.filter((d) => r.availableWeekdays!.includes(d)).map((d) => weekdayName(d, intl)).join(', ');
  if (r.availabilityMode === 'dates' && r.availableDates?.length) {
    const list = r.availableDates.map((s) => fromYmd(s).toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short' }));
    return list.length > 6 ? `${list.slice(0, 6).join(', ')} ${t('+{n} more', { n: list.length - 6 })}` : list.join(', ');
  }
  return null;
}
