import { secureStorage } from './storage';

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const BASE = `${API_ORIGIN}/api/v1`;
const KEY = 'unret.session';

export interface Session { accessToken: string; refreshToken: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let session: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

export async function loadSession() {
  if (!loaded) {
    const raw = await secureStorage.get(KEY);
    try { session = raw ? JSON.parse(raw) : null; } catch { session = null; }
    loaded = true;
  }
  return session;
}

export async function saveSession(s: Session | null) {
  session = s;
  loaded = true;
  await secureStorage.set(KEY, s ? JSON.stringify(s) : null);
  listeners.forEach((l) => l());
}

export function onSessionChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const getAccessToken = () => session?.accessToken ?? null;

/** Server file links may be relative (same-origin on web); make them absolute for the device. */
export function absUrl(u: string | null | undefined) {
  if (!u) return null;
  return u.startsWith('http') ? u : `${API_ORIGIN}${u}`;
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!session) return false;
  const rt = session.refreshToken;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
      if (!res.ok) { await saveSession(null); return false; }
      await saveSession(await res.json());
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; query?: Record<string, unknown> } = {}): Promise<T> {
  await loadSession();
  const qs = opts.query
    ? '?' + Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  const doFetch = () => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (session) headers.authorization = `Bearer ${session.accessToken}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(`${BASE}${path}${qs}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: (opts.form as any) ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  };
  let res: Response;
  try {
    res = await doFetch();
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your internet connection.');
  }
  if (res.status === 401 && session && !path.startsWith('/auth/login') && (await refresh())) res = await doFetch();
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new ApiError(res.status, Array.isArray(data?.message) ? data.message.join('. ') : data?.message ?? `Error ${res.status}`);
  return data as T;
}

export type Purpose = 'avatar' | 'portfolio' | 'request' | 'message' | 'verification' | 'logo';

/** Uploads a local file (from the image/document picker). On web the picker gives a File/Blob. */
export async function upload(file: { uri: string; name: string; mimeType: string; file?: Blob }, purpose: Purpose) {
  const form = new FormData();
  if (file.file) form.append('file', file.file as any, file.name);
  else form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('purpose', purpose);
  return api<{ key: string; name: string; mime: string; url: string }>('/files', { form });
}

export async function logout() {
  if (session) await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) }).catch(() => undefined);
  await saveSession(null);
}
