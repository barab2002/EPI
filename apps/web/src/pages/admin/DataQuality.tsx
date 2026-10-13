import { Link } from 'react-router-dom';
import type { DataQuality, RetentionInfo } from '../../api';
import { ErrorState, Skeleton } from '../../components/States';
import { t } from '../../i18n';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { shortDate } from './shared';
import { AdminKey, ta, taf } from './i18n-admin';

/** "{n} record(s)" in the current language: one/many forms from the admin catalog. */
const plural = (n: number, one: AdminKey, many: AdminKey) => taf(n === 1 ? one : many, { n });

export function pctLabel(p: number | null): string {
  return p === null ? t('na') : `${p}%`;
}

function Metric({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <article className="kpi-card">
      <h3 className="metric-label">{label}</h3>
      <p className={`kpi-value${warn ? ' warn-value' : ''}`}>{value}</p>
      <p className="muted small">{hint}</p>
    </article>
  );
}

/** How long EPI keeps data (ADR-032). Read-only: deletion runs daily on the server. */
export function RetentionSection() {
  const r = useApi<RetentionInfo>('/api/v1/admin/retention');
  if (r.state === 'loading') return <Skeleton lines={2} />;
  if (r.state === 'error') return <ErrorState error={r.error} onRetry={r.reload} />;
  const d = r.data;
  const total = (c: Record<string, number> | null | undefined) =>
    c ? Object.values(c).reduce((a, b) => a + b, 0) : 0;
  return (
    <section className="panel" aria-labelledby="retention-title">
      <h2 id="retention-title">{ta('dataRetention')}</h2>
      {d.months === null ? (
        <p className="muted">{ta('retentionOff')}</p>
      ) : (
        <>
          <p>
            {taf(d.automatic ? 'retentionDaily' : 'retentionManual', {
              n: d.months,
              date: shortDate(d.cutoff),
            })}
          </p>
          <p className="meta-row">
            <span>
              {ta('dueNow')}: {plural(total(d.due), 'recordOne', 'recordMany')}
            </span>
            <span>
              {ta('lastRun')}:{' '}
              {d.lastRun
                ? taf('lastRunDeleted', {
                    when: formatTime(d.lastRun.at),
                    what: plural(total(d.lastRun.counts), 'recordOne', 'recordMany'),
                  })
                : ta('neverLower')}
            </span>
          </p>
        </>
      )}
    </section>
  );
}

/** Can the KPIs be trusted? Freshness, identity coverage, status mapping and link coverage. */
export function DataQualityTab() {
  const dq = useApi<DataQuality>('/api/v1/admin/data-quality');
  if (dq.state === 'loading') return <Skeleton lines={4} />;
  if (dq.state === 'error') return <ErrorState error={dq.error} onRetry={dq.reload} />;
  const d = dq.data;
  const lowCoverage = (p: number | null) => p !== null && p < 90;
  return (
    <>
      <section className="panel" aria-labelledby="freshness-title">
        <h2 id="freshness-title">{ta('freshness')}</h2>
        {d.connections.length === 0 ? (
          <p className="muted">{ta('noSourceYet')}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{ta('connection')}</th>
                  <th scope="col">{ta('lastSuccessfulSync')}</th>
                  <th scope="col">{ta('state')}</th>
                </tr>
              </thead>
              <tbody>
                {d.connections.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{formatTime(c.lastSuccessAt)}</td>
                    <td>
                      {c.stale ? (
                        <span className="badge badge-bad">
                          {taf('stale', { h: d.staleAfterHours })}
                        </span>
                      ) : (
                        <span className="badge badge-managed">{ta('fresh')}</span>
                      )}
                      {c.lastRun?.status === 'failed' && (
                        <div className="error-text small">
                          {ta('lastRunFailed')}: {c.lastRun.error_summary}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="coverage-title">
        <h2 id="coverage-title">{ta('coverage')}</h2>
        <div className="kpi-grid">
          <Metric
            label={ta('jiraAssigneesMapped')}
            value={pctLabel(d.jira.assigneeCoveragePct)}
            hint={`${taf('ofAssignedItems', { a: d.jira.mappedAssignees, b: d.jira.withAssignee })} ${plural(d.jira.unmappedAccounts, 'unmappedOne', 'unmappedMany')}.`}
            warn={lowCoverage(d.jira.assigneeCoveragePct)}
          />
          <Metric
            label={ta('gitlabAuthorsMapped')}
            value={pctLabel(d.gitlab.authorCoveragePct)}
            hint={`${taf('ofMrs', { a: d.gitlab.mappedAuthors, b: d.gitlab.mergeRequests })} ${plural(d.gitlab.unmappedAccounts, 'unmappedOne', 'unmappedMany')}.`}
            warn={lowCoverage(d.gitlab.authorCoveragePct)}
          />
          <Metric
            label={ta('mrsLinked')}
            value={pctLabel(d.gitlab.jiraLinkPct)}
            hint={taf('mrsLinkedHint', { a: d.gitlab.linkedToJira, b: d.gitlab.mergeRequests })}
          />
        </div>
        {(d.jira.unmappedAccounts > 0 || d.gitlab.unmappedAccounts > 0) && (
          <p>
            <Link to="/admin/identities">{ta('mapRemaining')}</Link>
          </p>
        )}
      </section>
      <section className="panel" aria-labelledby="statuses-dq-title">
        <h2 id="statuses-dq-title">{ta('statusesNoCategory')}</h2>
        {d.jira.statusesWithoutCategory.length === 0 ? (
          <p className="muted">{ta('allStatusesCategorized')}</p>
        ) : (
          <>
            <p className="muted small">{ta('ignoredTransitions')}</p>
            <ul>
              {d.jira.statusesWithoutCategory.map((s) => (
                <li key={`${s.connection}:${s.status}`}>
                  {s.status} <span className="muted small">({s.connection})</span>
                </li>
              ))}
            </ul>
            <Link to="/admin/statuses">{ta('reviewStatusMappings')}</Link>
          </>
        )}
      </section>
      <RetentionSection />
    </>
  );
}
