'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getAccessToken, logout as apiLogout, saveSession } from './api';

export interface Me {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
  countryCode: string;
  preferredLanguage: string;
  avatarKey: string | null;
  city: string | null;
  addressText: string | null;
  mfaEnabled: boolean;
  country: { currency: string; defaultTimezone: string };
  professional: { id: string; visibility: 'HIDDEN' | 'LIMITED' | 'PUBLIC'; businessName: string | null; accountType: string; companyId: string | null } | null;
}

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
  login: (identifier: string, password: string, mfaCode?: string) => Promise<{ mfaRequired?: boolean; professional?: boolean }>;
  logout: () => Promise<void>;
  mode: 'customer' | 'professional';
  setMode: (m: 'customer' | 'professional') => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedMode, setModeState] = useState<'customer' | 'professional' | null>(null);

  const reload = useCallback(async () => {
    if (!getAccessToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api<Me>('/auth/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const m = localStorage.getItem('unret.mode');
      if (m === 'professional' || m === 'customer') setModeState(m);
    } catch {
      /* ignore */
    }
    reload();
    const onSession = () => reload();
    window.addEventListener('unret:session', onSession);
    return () => window.removeEventListener('unret:session', onSession);
  }, [reload]);

  const login = async (identifier: string, password: string, mfaCode?: string) => {
    const res = await api<{ accessToken?: string; refreshToken?: string; mfaRequired?: boolean }>('/auth/login', { body: { identifier, password, mfaCode } });
    if (res.mfaRequired) return { mfaRequired: true };
    saveSession({ accessToken: res.accessToken!, refreshToken: res.refreshToken! });
    clearMode();
    const u = await api<Me>('/auth/me');
    setMe(u);
    return { professional: !!u.professional };
  };

  const logout = async () => {
    await apiLogout();
    setMe(null);
    clearMode();
  };

  // A new sign-in starts from the account's default view (professional for professionals).
  const clearMode = () => {
    setModeState(null);
    try {
      localStorage.removeItem('unret.mode');
    } catch {
      /* ignore */
    }
  };

  const setMode = (m: 'customer' | 'professional') => {
    setModeState(m);
    try {
      localStorage.setItem('unret.mode', m);
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ me, loading, reload, login, logout, mode: me?.professional ? savedMode ?? 'professional' : 'customer', setMode }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
