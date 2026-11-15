import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ApiError } from './api';

/**
 * Loads data when a screen opens and again whenever `deps` change. `reload` fetches again
 * after an action; `setData` and `setError` let the screen apply an action's own result.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: readonly unknown[]): { data: T | null; setData: Dispatch<SetStateAction<T | null>>; error: string | null; setError: Dispatch<SetStateAction<string | null>>; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fn()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: ApiError) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, setData, error, setError, reload };
}
