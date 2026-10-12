import { useEffect, useState } from 'react';
import { api, Integration, SyncRun } from '../../api';
import { Empty, ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';

function RunBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="badge">no runs</span>;
  const cls =
    status === 'succeeded' ? 'badge-managed' : status === 'failed' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

/** Connections, their last sync, a "Sync now" action and recent runs. */
export function IntegrationsTab() {
  const list = useApi<Integration[]>('/api/v1/admin/integrations');
  const runs = useApi<SyncRun[]>('/api/v1/admin/sync-runs');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { reload: reloadRuns } = runs;
  const { reload: reloadList } = list;
  const running = runs.state === 'ready' && runs.data.some((r) => r.status === 'running');

  // While a run is in progress, refresh every 2 s.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => {
      reloadRuns();
      reloadList();
    }, 2000);
    return () => clearTimeout(t);
  }, [running, reloadRuns, reloadList, runs]);

  async function syncNow(name: string) {
    setBusy(name);
    setMessage(null);
    try {
      await api.post('/api/v1/admin/sync', { connection: name });
      setMessage({ kind: 'ok', text: `Sync of ${name} started.` });
      reloadRuns();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="integrations-title">
      <h2 id="integrations-title">Source connections</h2>
      <p className="muted small">
        Read-only Jira and GitLab connections. Tokens are never shown — only the name of the secret
        that holds them. Add connections with <code>jira-add</code> / <code>gitlab-add</code> (see
        docs/JIRA.md, docs/GITLAB.md).
      </p>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'error-text' : 'ok-text'}
        >
          {message.text}
        </p>
      )}
      {list.state === 'loading' && <Loading />}
      {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.state === 'ready' && list.data.length === 0 && (
        <Empty>No Jira or GitLab connection is configured yet. The demo uses synthetic data.</Empty>
      )}
      {list.state === 'ready' && list.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Source</th>
              <th scope="col">Last success</th>
              <th scope="col">Last run</th>
              <th scope="col">Secret</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted small">{c.endpoint}</div>
                </td>
                <td>{c.kind === 'jira' ? 'Jira DC' : 'GitLab'}</td>
                <td>{formatTime(c.last_success_at)}</td>
                <td>
                  <RunBadge status={c.last_run?.status} />
                  {c.last_run?.error_summary && (
                    <div className="error-text small">{c.last_run.error_summary}</div>
                  )}
                </td>
                <td>
                  <code>{c.secret_ref ?? '—'}</code>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    disabled={!c.enabled || busy === c.name || running}
                    onClick={() => syncNow(c.name)}
                  >
                    Sync now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>Recent sync runs</h3>
      {runs.state === 'ready' && runs.data.length === 0 && <p className="muted">No runs yet.</p>}
      {runs.state === 'ready' && runs.data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Connection</th>
              <th scope="col">Started</th>
              <th scope="col">Status</th>
              <th scope="col">Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.data.slice(0, 10).map((r) => (
              <tr key={r.id}>
                <td>{r.connection}</td>
                <td>{formatTime(r.started_at)}</td>
                <td>
                  <RunBadge status={r.status} />
                </td>
                <td className="small">
                  {r.error_summary ? (
                    <span className="error-text">{r.error_summary}</span>
                  ) : (
                    summarize(r.counts)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function summarize(c: Record<string, unknown>): string {
  const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : null);
  if (n('issuesSeen') !== null) {
    return `${n('issuesSeen')} issues · ${n('itemsInserted')} new · ${n('itemsUpdated')} updated · ${n('unmappedAssignees')} unmapped people`;
  }
  if (n('mrsSeen') !== null) {
    return `${n('mrsSeen')} MRs · ${n('mrsInserted')} new · ${n('reviewRequests')} review requests · ${n('unmappedUsers')} unmapped people`;
  }
  return '';
}
