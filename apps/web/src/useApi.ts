import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError | Error }
  | { state: 'ready'; data: T };

/** Fetches a GET endpoint; `url = null` skips the request. */
export function useApi<T>(url: string | null): Loadable<T> & { reload: () => void } {
  const [result, setResult] = useState<Loadable<T>>({ state: 'loading' });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setResult({ state: 'loading' });
    api.get<T>(url).then(
      (data) => !cancelled && setResult({ state: 'ready', data }),
      (error: Error) => !cancelled && setResult({ state: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, tick]);
  return { ...result, reload };
}
