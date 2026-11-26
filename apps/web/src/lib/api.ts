'use client';

const BASE = '/api/v1';
const KEY = 'unret.session';

export interface Session { accessToken: string; refreshToken: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('unret:session'));
}

export function getAccessToken() {
  return readSession()?.accessToken ?? null;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const s = readSession();
  if (!s) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
      if (!res.ok) {
        saveSession(null);
        return false;
      }
      saveSession(await res.json());
      return true;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; query?: Record<string, unknown> } = {}): Promise<T> {
  const qs = opts.query
    ? '?' + new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString()
    : '';
  const doFetch = () => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    return fetch(`${BASE}${path}${qs}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  };
  let res = await doFetch();
  if (res.status === 401 && readSession() && !path.startsWith('/auth/login')) {
    if (await refresh()) res = await doFetch();
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('. ') : data?.message ?? res.statusText;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return { message: t };
  }
}

export async function upload(file: File, purpose: 'avatar' | 'portfolio' | 'request' | 'message' | 'verification' | 'logo') {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', purpose);
  return api<{ key: string; name: string; mime: string; url: string }>('/files', { form });
}

export async function logout() {
  const s = readSession();
  if (s) await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => undefined);
  saveSession(null);
}

/** Downloads a file from the API (e.g. a CSV export) with the signed-in session, and saves it under `filename`. */
export async function download(path: string, filename: string, query: Record<string, unknown> = {}) {
  const qs = '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  const get = () => fetch(`${BASE}${path}${qs}`, { headers: getAccessToken() ? { authorization: `Bearer ${getAccessToken()}` } : {} });
  let res = await get();
  if (res.status === 401 && (await refresh())) res = await get();
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.message ?? 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
