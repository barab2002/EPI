import { useEffect, useState } from 'react';
import { api, PersonOption, SourceAccount } from '../../api';
import { Empty, ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';

type Status = 'unmapped' | 'mapped';

/** Search-as-you-type person picker. */
function PersonPicker({
  account,
  onPick,
}: {
  account: SourceAccount;
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
  const id = `pick-${account.source}-${account.external_id}`;
  return (
    <div className="picker">
      <label htmlFor={id} className="sr-only">
        Find the EPI person for {account.display_name ?? account.external_id}
      </label>
      <input
        id={id}
        type="search"
        placeholder="Type a name to map…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {debounced.length >= 2 && people.state === 'ready' && (
        <ul className="picker-results" aria-label="Matching people">
          {people.data.length === 0 && <li className="muted small">No matching people</li>}
          {people.data.map((p) => {
            const taken = p.identities?.find((i) => i.source === account.source);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="link-btn"
                  disabled={Boolean(taken)}
                  onClick={() => onPick(p)}
                >
                  {p.display_name}
                </button>
                {p.email && <span className="muted small"> {p.email}</span>}
                {taken && (
                  <span className="muted small"> — already mapped to {taken.external_id}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Map Jira/GitLab accounts seen during syncs to EPI people (EPI-008). */
export function IdentitiesTab() {
  const [status, setStatus] = useState<Status>('unmapped');
  const [source, setSource] = useState<'' | 'jira' | 'gitlab'>('');
  const accounts = useApi<SourceAccount[]>(
    `/api/v1/admin/accounts?status=${status}${source ? `&source=${source}` : ''}`,
  );
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function map(a: SourceAccount, p: PersonOption) {
    setMessage(null);
    try {
      const r = await api.put<{ reattributed: number }>(
        `/api/v1/admin/accounts/${a.source}/${encodeURIComponent(a.external_id)}/mapping`,
        { userId: p.id },
      );
      setMessage({
        kind: 'ok',
        text: `Mapped ${a.display_name ?? a.external_id} to ${p.display_name} (${r.reattributed} records attributed).`,
      });
      accounts.reload();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  async function unmap(a: SourceAccount) {
    if (
      !window.confirm(
        `Remove the mapping of ${a.display_name ?? a.external_id} to ${a.user_name}? Their synced work will no longer be attributed to them.`,
      )
    )
      return;
    setMessage(null);
    try {
      const r = await api.delete<{ reattributed: number }>(
        `/api/v1/admin/accounts/${a.source}/${encodeURIComponent(a.external_id)}/mapping`,
      );
      setMessage({ kind: 'ok', text: `Mapping removed (${r.reattributed} records unattributed).` });
      accounts.reload();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <section className="panel" aria-labelledby="identities-title">
      <h2 id="identities-title">Identity mapping</h2>
      <p className="muted small">
        Link Jira and GitLab accounts to EPI people. Work is attributed only through these verified
        mappings — never by matching display names. Each change is audited and applies to data
        already synced.
      </p>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Mapping status">
          {(['unmapped', 'mapped'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              className={status === s ? 'active' : ''}
              onClick={() => setStatus(s)}
            >
              {s === 'unmapped' ? 'Unmapped' : 'Mapped'}
            </button>
          ))}
        </div>
        <label className="inline-field">
          Source{' '}
          <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="">All</option>
            <option value="jira">Jira</option>
            <option value="gitlab">GitLab</option>
          </select>
        </label>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'error-text' : 'ok-text'}
        >
          {message.text}
        </p>
      )}
      {accounts.state === 'loading' && <Loading />}
      {accounts.state === 'error' && (
        <ErrorState error={accounts.error} onRetry={accounts.reload} />
      )}
      {accounts.state === 'ready' && accounts.data.length === 0 && (
        <Empty>
          {status === 'unmapped'
            ? 'Every account seen in syncs is mapped (or no sync has run yet).'
            : 'No accounts are mapped yet.'}
        </Empty>
      )}
      {accounts.state === 'ready' && accounts.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Source</th>
                <th scope="col">Activity</th>
                <th scope="col">Last seen</th>
                <th scope="col">{status === 'unmapped' ? 'Map to person' : 'Mapped to'}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={`${a.source}:${a.external_id}`}>
                  <td>
                    <strong>{a.display_name ?? '—'}</strong>
                    <div className="muted small">
                      <code>{a.external_id}</code>
                    </div>
                  </td>
                  <td>{a.source === 'jira' ? 'Jira' : 'GitLab'}</td>
                  <td>{a.activity}</td>
                  <td>{formatTime(a.last_seen_at)}</td>
                  <td>
                    {a.user_id ? (
                      <>
                        {a.user_name}{' '}
                        <button type="button" className="btn" onClick={() => unmap(a)}>
                          Unmap
                        </button>
                      </>
                    ) : (
                      <PersonPicker account={a} onPick={(p) => map(a, p)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
