import { FormEvent, useEffect, useState } from 'react';
import { api, Integration, SyncRun, SyncScheduleInfo } from '../../api';
import { Empty, ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { Flash, FlashMessage } from './shared';

function RunBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="badge">no runs</span>;
  const cls =
    status === 'succeeded' ? 'badge-managed' : status === 'failed' ? 'badge-bad' : 'badge-warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function timezones(): string[] {
  try {
    return (
      (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ??
      []
    );
  } catch {
    return [];
  }
}

const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Daily automatic sync of every enabled connection, at a local hour in a chosen time zone. */
export function SyncScheduleCard() {
  const info = useApi<SyncScheduleInfo>('/api/v1/admin/sync-schedule');
  const [message, setMessage] = useState<Flash>(null);
  const [saving, setSaving] = useState(false);

  if (info.state === 'loading') return <Loading />;
  if (info.state === 'error') return <ErrorState error={info.error} onRetry={info.reload} />;
  const s = info.data;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.put<SyncScheduleInfo>('/api/v1/admin/sync-schedule', {
        enabled: data.get('enabled') === 'on',
        hourLocal: Number(data.get('hourLocal')),
        timezone: String(data.get('timezone')).trim(),
      });
      setMessage({
        kind: 'ok',
        text: saved.enabled
          ? `Daily sync at ${pad(saved.hourLocal)} ${saved.timezone} saved.`
          : 'Daily sync turned off.',
      });
      info.reload();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="schedule-title">
      <h2 id="schedule-title">Daily sync</h2>
      <p className="muted small">
        Runs every enabled connection once a day, one after another. If EPI was down at that hour,
        it catches up later the same day. Failed runs never advance a connection&apos;s cursor.
      </p>
      {!s.schedulerActive && (
        <p role="note" className="error-text small">
          The scheduler is switched off on this server (<code>EPI_SYNC_SCHEDULER=off</code>). The
          schedule is saved, but nothing runs automatically.
        </p>
      )}
      <FlashMessage flash={message} />
      <form
        className="inline-form"
        onSubmit={save}
        key={`${s.enabled}-${s.hourLocal}-${s.timezone}`}
      >
        <label className="check-field">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> Sync daily
        </label>
        <label className="inline-field">
          Time
          <select name="hourLocal" defaultValue={s.hourLocal}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          Time zone
          <input
            name="timezone"
            defaultValue={s.timezone}
            list="epi-timezones"
            required
            maxLength={64}
          />
        </label>
        <datalist id="epi-timezones">
          {timezones().map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save schedule'}
        </button>
      </form>
      <p className="meta-row">
        <span>Next run: {s.nextRunAt ? formatTime(s.nextRunAt) : 'not scheduled'}</span>
        <span>
          Last scheduled run: {s.lastRunStartedAt ? formatTime(s.lastRunStartedAt) : 'never'}
        </span>
      </p>
    </section>
  );
}

/** Connections, their last sync, a "Sync now" action and recent runs. */
export function IntegrationsTab() {
  const list = useApi<Integration[]>('/api/v1/admin/integrations');
  const runs = useApi<SyncRun[]>('/api/v1/admin/sync-runs');
  const [message, setMessage] = useState<Flash>(null);
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
    <>
      <SyncScheduleCard />
      <section className="panel" aria-labelledby="integrations-title">
        <h2 id="integrations-title">Source connections</h2>
        <p className="muted small">
          Read-only Jira and GitLab connections. Tokens are never shown — only the name of the
          secret that holds them. Add connections with <code>jira-add</code> /{' '}
          <code>gitlab-add</code> (see docs/JIRA.md, docs/GITLAB.md).
        </p>
        <FlashMessage flash={message} />
        {list.state === 'loading' && <Loading />}
        {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.state === 'ready' && list.data.length === 0 && (
          <Empty>
            No Jira or GitLab connection is configured yet. The demo uses synthetic data.
          </Empty>
        )}
        {list.state === 'ready' && list.data.length > 0 && (
          <div className="table-wrap">
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
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
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
          </div>
        )}
        <h3>Recent sync runs</h3>
        {runs.state === 'ready' && runs.data.length === 0 && (
          <p className="muted">No sync has run yet. Runs appear here after the first sync.</p>
        )}
        {runs.state === 'ready' && runs.data.length > 0 && (
          <div className="table-wrap">
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
          </div>
        )}
      </section>
    </>
  );
}

function summarize(c: Record<string, unknown>): string {
  const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : null);
  if (n('issuesSeen') !== null) {
    return `${n('issuesSeen')} issues: ${n('itemsInserted')} new, ${n('itemsUpdated')} updated, ${n('unmappedAssignees')} unmapped people`;
  }
  if (n('mrsSeen') !== null) {
    return `${n('mrsSeen')} MRs: ${n('mrsInserted')} new, ${n('reviewRequests')} review requests, ${n('unmappedUsers')} unmapped people`;
  }
  return '';
}
