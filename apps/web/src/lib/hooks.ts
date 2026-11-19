'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

/** Minimal data-fetching hook with reload. */
export function useApi<T>(path: string | null, query?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const key = path ? path + JSON.stringify(query ?? {}) : null;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path, { query }));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Wraps an async action with pending/error state. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (...a: A): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await fn(...a);
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setPending(false);
    }
  };
  return { run, pending, error, setError };
}
