import { FormEvent, useEffect, useState } from 'react';
import { api, Integration, SyncRun, SyncScheduleInfo } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { Flash, FlashMessage } from './shared';
import { AdminKey, ta, taf } from './i18n-admin';

const RUN_LABELS: Record<string, AdminKey> = {
  succeeded: 'runSucceeded',
  failed: 'runFailed',
  running: 'runRunning',
};

function RunBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="badge">{ta('noRunsYet')}</span>;
  const cls =
    status === 'succeeded' ? 'badge-managed' : status === 'failed' ? 'badge-bad' : 'badge-warn';
  return (
    <span className={`badge ${cls}`}>{RUN_LABELS[status] ? ta(RUN_LABELS[status]) : status}</span>
  );
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

  if (info.state === 'loading') return <Skeleton lines={4} />;
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
          ? taf('dailySaved', { time: pad(saved.hourLocal), zone: saved.timezone })
          : ta('dailyOff'),
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
      <h2 id="schedule-title">{ta('dailySync')}</h2>
      <p className="muted small">{ta('dailyIntro')}</p>
      {!s.schedulerActive && (
        <p role="note" className="error-text small">
          {ta('schedulerOff')} (<code translate="no">EPI_SYNC_SCHEDULER=off</code>)
        </p>
      )}
      <FlashMessage flash={message} />
      <form
        className="inline-form"
        onSubmit={save}
        key={`${s.enabled}-${s.hourLocal}-${s.timezone}`}
      >
        <label className="check-field">
          <input type="checkbox" name="enabled" defaultChecked={s.enabled} /> {ta('syncDaily')}
        </label>
        <label className="inline-field">
          {ta('time')}
          <select name="hourLocal" defaultValue={s.hourLocal}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          {ta('timeZone')}
          <input
            name="timezone"
            defaultValue={s.timezone}
            list="epi-timezones"
            autoComplete="off"
            spellCheck={false}
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
          {saving ? ta('saving') : ta('saveSchedule')}
        </button>
      </form>
      <p className="meta-row">
        <span>
          {ta('nextRun')}: {s.nextRunAt ? formatTime(s.nextRunAt) : ta('notScheduled')}
        </span>
        <span>
          {ta('lastScheduledRun')}:{' '}
          {s.lastRunStartedAt ? formatTime(s.lastRunStartedAt) : ta('neverLower')}
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
      setMessage({ kind: 'ok', text: taf('syncStarted', { name }) });
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
        <h2 id="integrations-title">{ta('sourceConnections')}</h2>
        <p className="muted small">{ta('integrationsIntro')}</p>
        <FlashMessage flash={message} />
        {list.state === 'loading' && <Skeleton lines={4} />}
        {list.state === 'error' && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.state === 'ready' && list.data.length === 0 && (
          <Empty>{ta('noConnectionDemo')}</Empty>
        )}
        {list.state === 'ready' && list.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{ta('name')}</th>
                  <th scope="col">{ta('source')}</th>
                  <th scope="col">{ta('lastSuccess')}</th>
                  <th scope="col">{ta('lastRun')}</th>
                  <th scope="col">{ta('secret')}</th>
                  <th scope="col">
                    <span className="sr-only">{ta('actions')}</span>
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
                      <code translate="no">{c.secret_ref ?? '—'}</code>
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!c.enabled || busy === c.name || running}
                        onClick={() => syncNow(c.name)}
                      >
                        {ta('syncNow')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>{ta('recentRuns')}</h3>
        {runs.state === 'ready' && runs.data.length === 0 && (
          <p className="muted">{ta('noSyncYet')}</p>
        )}
        {runs.state === 'ready' && runs.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{ta('connection')}</th>
                  <th scope="col">{ta('started')}</th>
                  <th scope="col">{ta('status')}</th>
                  <th scope="col">{ta('summary')}</th>
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
    return taf('jiraRunSummary', {
      seen: n('issuesSeen')!,
      inserted: n('itemsInserted') ?? 0,
      updated: n('itemsUpdated') ?? 0,
      unmapped: n('unmappedAssignees') ?? 0,
    });
  }
  if (n('mrsSeen') !== null) {
    return taf('gitlabRunSummary', {
      seen: n('mrsSeen')!,
      inserted: n('mrsInserted') ?? 0,
      reviews: n('reviewRequests') ?? 0,
      unmapped: n('unmappedUsers') ?? 0,
    });
  }
  return '';
}
