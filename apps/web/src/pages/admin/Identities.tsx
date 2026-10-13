import { useEffect, useRef, useState } from 'react';
import { api, PersonOption, SourceAccount } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { Flash, FlashMessage } from './shared';
import { formatTime } from './Admin';
import { ta, taf } from './i18n-admin';

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
        {taf('findPersonFor', { name: account.display_name ?? account.external_id })}
      </label>
      <input
        id={id}
        type="search"
        placeholder={ta('typeNameToMap')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {debounced.length >= 2 && people.state === 'ready' && (
        <ul className="picker-results" aria-label={ta('matchingPeople')}>
          {people.data.length === 0 && <li className="muted small">{ta('noMatchingPeople')}</li>}
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
                  <span className="muted small">
                    {' '}
                    — {taf('alreadyMappedTo', { id: taken.external_id })}
                  </span>
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
  const [message, setMessage] = useState<Flash>(null);
  const busy = useRef(false);

  async function map(a: SourceAccount, p: PersonOption) {
    if (busy.current) return; // one mapping at a time: no double PUT from a double click
    busy.current = true;
    setMessage(null);
    try {
      const r = await api.put<{ reattributed: number }>(
        `/api/v1/admin/accounts/${a.source}/${encodeURIComponent(a.external_id)}/mapping`,
        { userId: p.id },
      );
      setMessage({
        kind: 'ok',
        text: taf('mapped', {
          account: a.display_name ?? a.external_id,
          person: p.display_name,
          n: r.reattributed,
        }),
      });
      accounts.reload();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      busy.current = false;
    }
  }

  async function unmap(a: SourceAccount) {
    if (
      !window.confirm(
        taf('confirmUnmap', {
          account: a.display_name ?? a.external_id,
          person: a.user_name ?? '',
        }),
      )
    )
      return;
    setMessage(null);
    try {
      const r = await api.delete<{ reattributed: number }>(
        `/api/v1/admin/accounts/${a.source}/${encodeURIComponent(a.external_id)}/mapping`,
      );
      setMessage({ kind: 'ok', text: taf('unmapped', { n: r.reattributed }) });
      accounts.reload();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  return (
    <section className="panel" aria-labelledby="identities-title">
      <h2 id="identities-title">{ta('tabIdentities')}</h2>
      <p className="muted small">{ta('identitiesIntro')}</p>
      <div className="inline-form">
        <div className="segmented" role="group" aria-label={ta('mappingStatus')}>
          {(['unmapped', 'mapped'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              className={status === s ? 'active' : ''}
              onClick={() => setStatus(s)}
            >
              {s === 'unmapped' ? ta('statusUnmapped') : ta('statusMapped')}
            </button>
          ))}
        </div>
        <label className="inline-field">
          {ta('source')}
          <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="">{ta('all')}</option>
            <option value="jira">Jira</option>
            <option value="gitlab">GitLab</option>
          </select>
        </label>
      </div>
      <FlashMessage flash={message} />
      {accounts.state === 'loading' && <Skeleton lines={4} />}
      {accounts.state === 'error' && (
        <ErrorState error={accounts.error} onRetry={accounts.reload} />
      )}
      {accounts.state === 'ready' && accounts.data.length === 0 && (
        <Empty>{status === 'unmapped' ? ta('allMapped') : ta('noneMapped')}</Empty>
      )}
      {accounts.state === 'ready' && accounts.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{ta('account')}</th>
                <th scope="col">{ta('source')}</th>
                <th scope="col" className="num">
                  {ta('activity')}
                </th>
                <th scope="col">{ta('lastSeen')}</th>
                <th scope="col">{status === 'unmapped' ? ta('mapToPerson') : ta('mappedTo')}</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={`${a.source}:${a.external_id}`}>
                  <td>
                    <strong>{a.display_name ?? '—'}</strong>
                    <div className="muted small">
                      <code translate="no">{a.external_id}</code>
                    </div>
                  </td>
                  <td>{a.source === 'jira' ? 'Jira' : 'GitLab'}</td>
                  <td className="num">{a.activity}</td>
                  <td>{formatTime(a.last_seen_at)}</td>
                  <td>
                    {a.user_id ? (
                      <>
                        {a.user_name}{' '}
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => unmap(a)}
                        >
                          {ta('unmap')}
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
