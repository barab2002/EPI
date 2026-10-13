import { useEffect, useState } from 'react';
import { api, AuditEvent, AuditPage, PersonOption } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { PersonSearch } from './shared';
import { AdminKey, ta, taf } from './i18n-admin';

const ACTION_GROUPS: [string, AdminKey][] = [
  ['', 'grpAll'],
  ['auth.', 'grpAuth'],
  ['role.', 'grpRole'],
  ['membership.', 'grpMembership'],
  ['identity.', 'tabIdentities'],
  ['sync.', 'grpSync'],
  ['directory.', 'grpDirectory'],
];

/** Plain-language names for audit actions; unknown actions fall back to their code. */
const ACTION_LABELS: Record<string, AdminKey> = {
  'auth.login': 'actAuthLogin',
  'auth.login_failed': 'actAuthLoginFailed',
  'auth.logout': 'actAuthLogout',
  'assessment.create': 'actAssessmentCreate',
  'assessment.update': 'actAssessmentUpdate',
  'grade.set': 'actGradeSet',
  'group.create': 'actGroupCreate',
  'group.rename': 'actGroupRename',
  'identity.linked': 'actIdentityLinked',
  'identity.map': 'actIdentityMap',
  'identity.unmap': 'actIdentityUnmap',
  'integration.upsert': 'actIntegrationUpsert',
  'integration.create': 'actIntegrationCreate',
  'integration.update': 'actIntegrationUpdate',
  'membership.add': 'actMembershipAdd',
  'membership.transfer': 'actMembershipTransfer',
  'membership.end': 'actMembershipEnd',
  'person.create': 'actPersonCreate',
  'person.update': 'actPersonUpdate',
  'role.assign': 'actRoleAssign',
  'role.end': 'actRoleEnd',
  'seed.demo': 'actSeedDemo',
  'status_mapping.update': 'actStatusMappingUpdate',
  'sync.schedule': 'actSyncSchedule',
  'sync.scheduled': 'actSyncScheduled',
  'sync.start': 'actSyncStart',
  'sync_schedule.update': 'actSyncScheduleUpdate',
  'team.create': 'actTeamCreate',
  'team.update': 'actTeamUpdate',
  'directory.mapping': 'actDirectoryMapping',
  'directory.link': 'actDirectoryLink',
  'directory.import': 'actDirectoryImport',
  'retention.run': 'actRetentionRun',
  'admin.bootstrap': 'actAdminBootstrap',
};
export const actionLabel = (a: string) => (ACTION_LABELS[a] ? ta(ACTION_LABELS[a]) : a);

/** Plain names for audited resource types; unknown types are shown with spaces. */
const RESOURCE_LABELS: Record<string, AdminKey> = {
  app_setting: 'resAppSetting',
  assessment: 'resAssessment',
  directory: 'resDirectory',
  directory_group: 'resDirectoryGroup',
  external_identity: 'resExternalIdentity',
  group: 'resGroup',
  integration_connection: 'resIntegrationConnection',
  retention: 'resRetention',
  role_assignment: 'resRoleAssignment',
  session: 'resSession',
  status_mapping: 'resStatusMapping',
  system: 'resSystem',
  team: 'resTeam',
  team_membership: 'resTeamMembership',
  user: 'resUser',
};
const resourceLabel = (type: string) =>
  RESOURCE_LABELS[type] ? ta(RESOURCE_LABELS[type]) : type.replace(/_/g, ' ');

/** Readable metadata pairs; values are never personal data or review text. */
function details(m: Record<string, unknown>): string[] {
  return Object.entries(m).map(
    ([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`,
  );
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
      <h2 id="audit-title">{ta('tabAudit')}</h2>
      <p className="muted small">{ta('auditIntro')}</p>
      <div className="inline-form">
        <label className="inline-field">
          {ta('action')}
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTION_GROUPS.map(([v, l]) => (
              <option key={v} value={v}>
                {ta(l)}
              </option>
            ))}
            {knownExact.length > 0 && (
              <optgroup label={ta('exactAction')}>
                {knownExact.map((a) => (
                  <option key={a} value={a}>
                    {actionLabel(a)} ({a})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        {actor ? (
          <span className="form-subject">
            {ta('by')}&nbsp;<strong>{actor.display_name}</strong>&nbsp;
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setActor(null)}
              aria-label={taf('clearPersonFilter', { name: actor.display_name })}
            >
              {ta('clear')}
            </button>
          </span>
        ) : (
          <PersonSearch label={ta('filterByPerson')} onPick={setActor} />
        )}
        <label className="inline-field">
          {ta('from')}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="inline-field">
          {ta('to')}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {error && <ErrorState error={error} onRetry={() => setTick((n) => n + 1)} />}
      {!error && items === null && <Skeleton lines={4} />}
      {items !== null && items.length === 0 && <Empty>{ta('noAuditEvents')}</Empty>}
      {items !== null && items.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{ta('when')}</th>
                  <th scope="col">{ta('who')}</th>
                  <th scope="col">{ta('action')}</th>
                  <th scope="col">{ta('resource')}</th>
                  <th scope="col">{ta('details')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <time dateTime={e.at}>{formatTime(e.at)}</time>
                    </td>
                    <td>{e.actor?.name ?? <span className="muted">{ta('system')}</span>}</td>
                    <td>
                      {actionLabel(e.action)}
                      <div>
                        <code className="nowrap small" translate="no">
                          {e.action}
                        </code>
                      </div>
                    </td>
                    <td>
                      {e.resourceLabel ?? (
                        <span className="muted">{resourceLabel(e.resourceType)}</span>
                      )}
                    </td>
                    <td className="small">
                      <ul className="detail-list" translate="no">
                        {details(e.metadata).map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <button type="button" className="btn" onClick={more} disabled={loadingMore}>
              {loadingMore ? ta('loading') : ta('loadOlder')}
            </button>
          )}
        </>
      )}
    </section>
  );
}
