import { useState } from 'react';
import { api, StatusMapping } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { Flash, FlashMessage } from './shared';

const CATEGORIES: [string, string][] = [
  ['TODO', 'To do'],
  ['IN_PROGRESS', 'In progress'],
  ['BLOCKED', 'Blocked'],
  ['REVIEW', 'Review'],
  ['QA', 'QA'],
  ['DONE', 'Done'],
  ['', 'Ignore (not a workflow status)'],
];

/** Source status → EPI category (drives Cycle Time and Aging). Applies on the next sync. */
export function StatusesTab() {
  const list = useApi<StatusMapping[]>('/api/v1/admin/status-mappings');
  const [message, setMessage] = useState<Flash>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function save(m: StatusMapping, category: string) {
    const key = `${m.connection}:${m.source_status_id}`;
    setSaving(key);
    setMessage(null);
    try {
      await api.put(
        `/api/v1/admin/status-mappings/${encodeURIComponent(m.connection)}/${encodeURIComponent(m.source_status_id)}`,
        {
          category: category || null,
        },
      );
      setMessage({
        kind: 'ok',
        text: `“${m.source_status_name}” saved. It applies to history on the next sync.`,
      });
      list.reload();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="statuses-title">
      <h2 id="statuses-title">Status mappings</h2>
      <p className="muted small">
        Jira statuses are first mapped from Jira’s own categories (To do / In progress / Done).
        Confirm them and mark statuses that mean Blocked, Review or QA. Your choices are never
        overwritten by syncs.
      </p>
      <FlashMessage flash={message} />
      {list.state === 'loading' && <Skeleton lines={4} />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && list.data.length === 0 && (
        <Empty>No statuses yet — they appear after the first Jira sync.</Empty>
      )}
      {list.state === 'ready' && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Connection</th>
                <th scope="col">Jira status</th>
                <th scope="col">EPI category</th>
                <th scope="col">Set by</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((m) => (
                <tr key={`${m.connection}:${m.source_status_id}`}>
                  <td>{m.connection}</td>
                  <td>
                    {m.source_status_name}{' '}
                    <span className="muted small" translate="no">
                      #{m.source_status_id}
                    </span>
                  </td>
                  <td>
                    <label
                      className="sr-only"
                      htmlFor={`cat-${m.connection}-${m.source_status_id}`}
                    >
                      Category for {m.source_status_name}
                    </label>
                    <select
                      id={`cat-${m.connection}-${m.source_status_id}`}
                      value={m.category ?? ''}
                      disabled={saving !== null}
                      aria-busy={saving === `${m.connection}:${m.source_status_id}`}
                      onChange={(e) => save(m, e.target.value)}
                    >
                      {CATEGORIES.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      className={`badge ${m.origin === 'admin' ? 'badge-managed' : 'badge-warn'}`}
                    >
                      {m.origin === 'admin' ? 'Administrator' : 'Inferred — please confirm'}
                    </span>
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
