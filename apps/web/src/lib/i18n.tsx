'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ro } from './messages/ro';

/**
 * Lightweight i18n: English source strings are the keys; other locales map them.
 * Missing translations fall back to English. Interpolation: t('Hello {name}', { name }).
 */
export type Locale = 'ro' | 'en';
const DICTS: Record<Locale, Record<string, string>> = { en: {}, ro };
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'ro', label: 'Română' },
  { code: 'en', label: 'English' },
];

interface Ctx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (s: string, vars?: Record<string, string | number>) => string;
  intl: string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ro');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('unret.locale') as Locale | null;
      if (saved && DICTS[saved]) setLocaleState(saved);
      else if (!navigator.language.startsWith('ro')) setLocaleState('en');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('unret.locale', l);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (s: string, vars?: Record<string, string | number>) => {
      let out = DICTS[locale][s] ?? s;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t, intl: locale === 'ro' ? 'ro-RO' : 'en-GB' }}>{children}</I18nContext.Provider>;
}

export function useT() {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useT outside I18nProvider');
  return c;
}
