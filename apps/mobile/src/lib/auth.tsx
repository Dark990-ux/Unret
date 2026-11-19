import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadSession, logout as apiLogout, onSessionChange, saveSession } from './api';
import { secureStorage } from './storage';
import { registerForPush } from './push';

export interface Me {
  id: string; name: string; email: string | null; phone: string | null; role: 'USER' | 'ADMIN'; countryCode: string; preferredLanguage: string;
  city: string | null; addressText: string | null; mfaEnabled: boolean; country: { currency: string; defaultTimezone: string };
  professional: { id: string; visibility: 'HIDDEN' | 'LIMITED' | 'PUBLIC'; businessName: string | null; accountType: string; companyId: string | null } | null;
}
type Mode = 'customer' | 'professional';
interface AuthCtx {
  me: Me | null; loading: boolean; reload: () => Promise<void>;
  login: (id: string, pw: string, mfa?: string) => Promise<{ mfaRequired?: boolean }>;
  register: (body: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  mode: Mode; setMode: (m: Mode) => void;
}
const C = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>('customer');

  const reload = useCallback(async () => {
    const s = await loadSession();
    if (!s) { setMe(null); setLoading(false); return; }
    try { setMe(await api<Me>('/auth/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    secureStorage.get('unret.mode').then((m) => (m === 'professional' || m === 'customer') && setModeState(m));
    reload();
    return onSessionChange(() => { reload(); });
  }, [reload]);

  // Register this device for push notifications once signed in.
  useEffect(() => { if (me) registerForPush().catch(() => undefined); }, [me?.id]);

  const login = async (identifier: string, password: string, mfaCode?: string) => {
    const r = await api('/auth/login', { body: { identifier, password, mfaCode } });
    if (r.mfaRequired) return { mfaRequired: true };
    await saveSession(r);
    return {};
  };
  const register = async (body: Record<string, unknown>) => { await saveSession(await api('/auth/register', { body })); };
  const logout = async () => { await apiLogout(); setMe(null); };
  const setMode = (m: Mode) => { setModeState(m); secureStorage.set('unret.mode', m); };

  return <C.Provider value={{ me, loading, reload, login, register, logout, mode: me?.professional ? mode : 'customer', setMode }}>{children}</C.Provider>;
}

export function useAuth() {
  const c = useContext(C);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
