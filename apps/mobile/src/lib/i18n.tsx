import * as Localization from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Locale, translate, addTranslations } from '@unret/shared';
import { secureStorage } from './storage';
import { mobileRo } from './messages';

addTranslations('ro', mobileRo);

interface Ctx { locale: Locale; setLocale: (l: Locale) => void; t: (s: string, v?: Record<string, string | number>) => string; intl: string }
const C = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const device = Localization.getLocales()[0]?.languageCode === 'ro' ? 'ro' : 'en';
  const [locale, setState] = useState<Locale>(device);
  useEffect(() => { secureStorage.get('unret.locale').then((l) => (l === 'ro' || l === 'en') && setState(l)); }, []);
  const setLocale = useCallback((l: Locale) => { setState(l); secureStorage.set('unret.locale', l); }, []);
  const t = useCallback((s: string, v?: Record<string, string | number>) => translate(locale, s, v), [locale]);
  return <C.Provider value={{ locale, setLocale, t, intl: locale === 'ro' ? 'ro-RO' : 'en-GB' }}>{children}</C.Provider>;
}

export function useT() {
  const c = useContext(C);
  if (!c) throw new Error('useT outside provider');
  return c;
}
