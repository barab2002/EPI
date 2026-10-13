import { useEffect, useRef, useState } from 'react';
import type { PersonOption } from '../../api';
import { useApi } from '../../useApi';

export type Flash = { kind: 'ok' | 'error'; text: string } | null;

/** Result of an admin action. Scrolls itself into view: forms lower in a long panel report here. */
export function FlashMessage({ flash }: { flash: Flash }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (flash) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [flash]);
  if (!flash) return null;
  return (
    <p
      ref={ref}
      role={flash.kind === 'error' ? 'alert' : 'status'}
      className={`flash ${flash.kind === 'error' ? 'flash-error' : 'flash-ok'}`}
    >
      {flash.text}
    </p>
  );
}

/**
 * Runs an admin mutation and reports the result in a flash message. While one is in flight,
 * further calls are ignored (no duplicate creates from a double click) and `run.pending` is true
 * so forms can disable their submit buttons.
 */
export function useMutation(setFlash: (f: Flash) => void) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const run = async (action: () => Promise<unknown>, ok: string, after?: () => void) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFlash(null);
    try {
      await action();
      setFlash({ kind: 'ok', text: ok });
      after?.();
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return Object.assign(run, { pending });
}

export const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** yyyy-mm-dd from a date input → ISO at 00:00 UTC; today means "now". */
export const dateToIso = (d: string) =>
  d === today() ? new Date().toISOString() : new Date(`${d}T00:00:00Z`).toISOString();
export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

/** Debounced people search used by membership and people screens. */
export function PersonSearch({
  label,
  onPick,
}: {
  label: string;
  onPick: (p: PersonOption) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const people = useApi<PersonOption[]>(
    debounced.length >= 2 ? `/api/v1/admin/users?q=${encodeURIComponent(debounced)}` : null,
  );
  return (
    <div className="picker">
      <label>
        <span className="sr-only">{label}</span>
        <input
          type="search"
          placeholder={label}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </label>
      {debounced.length >= 2 && people.state === 'ready' && (
        <ul className="picker-results" aria-label="Matching people">
          {people.data.length === 0 && <li className="muted small">No matching people</li>}
          {people.data.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  onPick(p);
                  setQ('');
                }}
              >
                {p.display_name}
              </button>
              {p.email && <span className="muted small"> {p.email}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
