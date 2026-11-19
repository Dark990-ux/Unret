import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './api';

/** Fetches on mount and whenever the screen regains focus. */
export function useApi<T>(path: string | null, query?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [refreshing, setRefreshing] = useState(false);
  const key = path ? path + JSON.stringify(query ?? {}) : null;

  const load = useCallback(async (pull = false) => {
    if (!path) return;
    pull ? setRefreshing(true) : setLoading((l) => l || data === null);
    try { setData(await api<T>(path, { query })); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { if (data !== null) load(); /* eslint-disable-next-line */ }, [load]));
  return { data, error, loading, refreshing, reload: load, refresh: () => load(true), setData };
}
