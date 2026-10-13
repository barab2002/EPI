import { useEffect, useState } from 'react';
import { api, AuditEvent, AuditPage, PersonOption } from '../../api';
import { Empty, ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { PersonSearch } from './shared';

const ACTION_GROUPS = [
  ['', 'All actions'],
  ['auth.', 'Sign-ins and sign-outs'],
  ['role.', 'Role changes'],
  ['membership.', 'Team memberships'],
  ['identity.', 'Identity mapping'],
  ['sync.', 'Syncs'],
] as const;

/** Compact, readable metadata ("key: value · …"); values are never personal data or review text. */
function details(m: Record<string, unknown>): string {
  return Object.entries(m)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

function buildQuery(f: { action: string; actor: PersonOption | null; from: string; to: string }) {
  const p = new URLSearchParams({ limit: '50' });
  if (f.action) p.set('action', f.action);
  if (f.actor) p.set('actorId', f.actor.id);
  if (f.from) p.set('from', new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    p.set('to', end.toISOString());
  }
  return p.toString();
}

/** Read-only audit trail: who changed what and when. Review subjects and text are never shown. */
export function AuditTab() {
  const actions = useApi<string[]>('/api/v1/admin/audit-actions');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState<PersonOption | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AuditEvent[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const query = buildQuery({ action, actor, from, to });

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    api.get<AuditPage>(`/api/v1/admin/audit-events?${query}`).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      },
      (e: Error) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [query, tick]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.get<AuditPage>(
        `/api/v1/admin/audit-events?${query}&cursor=${encodeURIComponent(cursor)}`,
      );
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoadingMore(false);
    }
  }

  const knownExact = actions.state === 'ready' ? actions.data : [];

  return (
    <section className="panel" aria-labelledby="audit-title">
      <h2 id="audit-title">Audit log</h2>
      <p className="muted small">
        Every administrative change, review action, sign-in and sync, newest first. Entries are
        append-only. For reviews you see who acted and when — never about whom or what was written.
      </p>
      <div className="toolbar">
        <label className="inline-field">
          Action{' '}
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTION_GROUPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {knownExact.length > 0 && (
              <optgroup label="Exact action">
                {knownExact.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {actor ? (
          <span className="inline-field">
            By <strong>{actor.display_name}</strong>{' '}
            <button type="button" className="btn" onClick={() => setActor(null)}>
              Clear
            </button>
          </span>
        ) : (
          <PersonSearch label="Filter by person…" onPick={setActor} />
        )}
        <label className="inline-field">
          From{' '}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="inline-field">
          To{' '}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {error && <ErrorState error={error} onRetry={() => setTick((n) => n + 1)} />}
      {!error && items === null && <Loading />}
      {items !== null && items.length === 0 && <Empty>No audit events match these filters.</Empty>}
      {items !== null && items.length > 0 && (
        <>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>
                    <time dateTime={e.at}>{formatTime(e.at)}</time>
                  </td>
                  <td>{e.actor?.name ?? <span className="muted">system</span>}</td>
                  <td>
                    <code className="nowrap">{e.action}</code>
                  </td>
                  <td>
                    {e.resourceLabel ?? (
                      <span className="muted">{e.resourceType.replace(/_/g, ' ')}</span>
                    )}
                  </td>
                  <td className="small">{details(e.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor && (
            <button type="button" className="btn" onClick={more} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load older events'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
