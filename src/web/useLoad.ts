import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ApiError } from './api';

/**
 * Loads data when a screen opens and again whenever `deps` change. `reload` fetches again
 * after an action; `setData` and `setError` let the screen apply an action's own result.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[]): { data: T | null; setData: Dispatch<SetStateAction<T | null>>; error: string | null; setError: Dispatch<SetStateAction<string | null>>; reload: () => Promise<boolean> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may set state, so a slow earlier response cannot overwrite a later one.
  const latest = useRef(0);
  const reload = useCallback(() => {
    const request = ++latest.current;
    return fn()
      .then((d) => {
        if (request !== latest.current) return false;
        setData(d);
        setError(null);
        return true;
      })
      .catch((e: ApiError) => {
        if (request === latest.current) setError(e.message);
        return false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, setError, reload };
}
