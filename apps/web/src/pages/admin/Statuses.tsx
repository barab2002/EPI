import { useState } from 'react';
import { api, StatusMapping } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { Flash, FlashMessage } from './shared';
import { AdminKey, ta, taf } from './i18n-admin';

const CATEGORIES: [string, AdminKey][] = [
  ['TODO', 'catTodo'],
  ['IN_PROGRESS', 'catInProgress'],
  ['BLOCKED', 'catBlocked'],
  ['REVIEW', 'catReview'],
  ['QA', 'catQa'],
  ['DONE', 'catDone'],
  ['', 'catIgnore'],
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
        text: taf('statusSaved', { name: m.source_status_name }),
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
      <h2 id="statuses-title">{ta('tabStatuses')}</h2>
      <p className="muted small">{ta('statusesIntro')}</p>
      <FlashMessage flash={message} />
      {list.state === 'loading' && <Skeleton lines={4} />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && list.data.length === 0 && <Empty>{ta('noStatuses')}</Empty>}
      {list.state === 'ready' && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{ta('connection')}</th>
                <th scope="col">{ta('jiraStatus')}</th>
                <th scope="col">{ta('epiCategory')}</th>
                <th scope="col">{ta('setBy')}</th>
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
                      {taf('categoryFor', { name: m.source_status_name })}
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
                          {ta(label)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span
                      className={`badge ${m.origin === 'admin' ? 'badge-managed' : 'badge-warn'}`}
                    >
                      {m.origin === 'admin' ? ta('setByAdmin') : ta('inferred')}
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
