import { Link } from 'react-router-dom';
import type { DataQuality } from '../../api';
import { ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function pctLabel(p: number | null): string {
  return p === null ? 'N/A' : `${p}%`;
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

/** Can the KPIs be trusted? Freshness, identity coverage, status mapping and link coverage. */
export function DataQualityTab() {
  const dq = useApi<DataQuality>('/api/v1/admin/data-quality');
  if (dq.state === 'loading') return <Loading />;
  if (dq.state === 'error') return <ErrorState error={dq.error} onRetry={dq.reload} />;
  const d = dq.data;
  const lowCoverage = (p: number | null) => p !== null && p < 90;
  return (
    <>
      <section className="panel" aria-labelledby="freshness-title">
        <h2 id="freshness-title">Freshness</h2>
        {d.connections.length === 0 ? (
          <p className="muted">
            No source connection is configured yet, so KPIs use synthetic demo data. Add one under
            Integrations.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Connection</th>
                  <th scope="col">Last successful sync</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {d.connections.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{formatTime(c.lastSuccessAt)}</td>
                    <td>
                      {c.stale ? (
                        <span className="badge badge-bad">Stale (&gt; {d.staleAfterHours} h)</span>
                      ) : (
                        <span className="badge badge-managed">Fresh</span>
                      )}
                      {c.lastRun?.status === 'failed' && (
                        <div className="error-text small">
                          Last run failed: {c.lastRun.error_summary}
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
        <h2 id="coverage-title">Coverage</h2>
        <div className="kpi-grid">
          <Metric
            label="Jira assignees mapped"
            value={pctLabel(d.jira.assigneeCoveragePct)}
            hint={`${d.jira.mappedAssignees} of ${d.jira.withAssignee} assigned items. ${plural(d.jira.unmappedAccounts, 'unmapped account')}.`}
            warn={lowCoverage(d.jira.assigneeCoveragePct)}
          />
          <Metric
            label="GitLab MR authors mapped"
            value={pctLabel(d.gitlab.authorCoveragePct)}
            hint={`${d.gitlab.mappedAuthors} of ${d.gitlab.mergeRequests} MRs. ${plural(d.gitlab.unmappedAccounts, 'unmapped account')}.`}
            warn={lowCoverage(d.gitlab.authorCoveragePct)}
          />
          <Metric
            label="MRs linked to Jira"
            value={pctLabel(d.gitlab.jiraLinkPct)}
            hint={`${d.gitlab.linkedToJira} of ${d.gitlab.mergeRequests} MRs carry a known issue key.`}
          />
        </div>
        {(d.jira.unmappedAccounts > 0 || d.gitlab.unmappedAccounts > 0) && (
          <p>
            <Link to="/admin/identities">Map the remaining accounts</Link>
          </p>
        )}
      </section>
      <section className="panel" aria-labelledby="statuses-dq-title">
        <h2 id="statuses-dq-title">Statuses without a category</h2>
        {d.jira.statusesWithoutCategory.length === 0 ? (
          <p className="muted">Every Jira status has a category.</p>
        ) : (
          <>
            <p className="muted small">Transitions into these statuses are ignored by flow KPIs.</p>
            <ul>
              {d.jira.statusesWithoutCategory.map((s) => (
                <li key={`${s.connection}:${s.status}`}>
                  {s.status} <span className="muted small">({s.connection})</span>
                </li>
              ))}
            </ul>
            <Link to="/admin/statuses">Review status mappings</Link>
          </>
        )}
      </section>
    </>
  );
}
