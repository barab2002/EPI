import { useSearchParams } from 'react-router-dom';

/**
 * One query parameter as page state (e.g. `?team=…` on an admin tab), so filters and selections
 * survive reload, Back and shared links. Empty values are removed; history is not filled.
 */
export function useUrlParam(key: string): [string, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = (value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return [params.get(key) ?? '', set];
}
