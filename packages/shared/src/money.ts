/** Money is always stored as integer minor units + ISO 4217 currency code. */
export interface Money {
  amountMinor: number;
  currency: string;
}

const MINOR_DIGITS: Record<string, number> = { RON: 2, EUR: 2, USD: 2, GBP: 2, HUF: 2, BGN: 2, PLN: 2, JPY: 0 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

export function formatMoney(minor: number | null | undefined, currency: string, locale = 'ro-RO'): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fromMinor(minor, currency));
}
