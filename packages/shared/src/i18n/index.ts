import { ro } from './ro';

export type Locale = 'ro' | 'en';
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'ro', label: 'Română' },
  { code: 'en', label: 'English' },
];
const DICTS: Record<Locale, Record<string, string>> = { en: {}, ro };

/** English source strings are keys; missing translations fall back to English. */
export function translate(locale: Locale, s: string, vars?: Record<string, string | number>): string {
  let out = DICTS[locale]?.[s] ?? s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Extend a locale's dictionary (used by apps for app-specific strings). */
export function addTranslations(locale: Locale, entries: Record<string, string>) {
  Object.assign(DICTS[locale], entries);
}

export { ro };
