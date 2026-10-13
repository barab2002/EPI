import { useState } from 'react';
import { api, DirectoryPreview, DirectoryStatus, ImportPlan, OrgNode } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { intlLocale } from '../../i18n';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { Flash, FlashMessage, useMutation } from './shared';
import { AdminKey, ta, taf } from './i18n-admin';

/** "cn=Team-Payments,ou=Groups,…" → "Team-Payments". */
export const groupLabel = (dn: string) => /^cn=([^,]+)/i.exec(dn)?.[1] ?? dn;

/** One/many message for a count, e.g. ('dirCreate', 2) → "add 2 new people". */
const count = (base: string, n: number) =>
  taf(`${base}${n === 1 ? 'One' : 'Many'}` as AdminKey, { n });

/** One sentence that says what applying will do (the confirmation repeats it). */
export function planSummary(p: ImportPlan): string {
  const parts = [
    p.creates.length && count('dirCreate', p.creates.length),
    p.links.length && count('dirLink', p.links.length),
    p.updates.length && count('dirUpdate', p.updates.length),
    p.adds.length && count('dirAdd', p.adds.length),
    p.ends.length && count('dirEnd', p.ends.length),
  ].filter(Boolean) as string[];
  if (!parts.length) return ta('dirNothing');
  const list = new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(parts);
  return taf('dirApplying', { list });
}

function ChangeList({
  title,
  items,
}: {
  title: string;
  items: { key: string; main: string; detail: string }[];
}) {
  if (!items.length) return null;
  return (
    <div className="form-group">
      <h3>
        {title} <span className="badge">{items.length}</span>
      </h3>
      <ul className="plain-list history-list">
        {items.map((i) => (
          <li key={i.key}>
            <span>{i.main}</span>
            <span className="muted small">{i.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewView({
  preview,
  run,
  onApplied,
}: {
  preview: DirectoryPreview;
  run: ReturnType<typeof useMutation>;
  onApplied: () => void;
}) {
  const { plan, teamNames } = preview;
  const team = (id: string) => teamNames[id] ?? ta('unknownTeam');

  function apply() {
    const ends = plan.ends.length ? ` ${count('dirEndsToday', plan.ends.length)}` : '';
    if (!window.confirm(`${planSummary(plan)}${ends} ${ta('continueQ')}`)) return;
    void run(
      () => api.post('/api/v1/admin/directory/apply', { hash: preview.hash }),
      ta('importApplied'),
      onApplied,
    );
  }

  return (
    <section className="panel" aria-labelledby="preview-title">
      <h2 id="preview-title">{ta('preview')}</h2>
      <p className="muted small">{taf('readAt', { when: formatTime(preview.readAt) })}</p>
      <p>{planSummary(plan)}</p>
      {plan.conflicts.length > 0 && (
        <div className="form-group">
          <h3>
            {ta('skipped')} <span className="badge badge-bad">{plan.conflicts.length}</span>
          </h3>
          <ul className="plain-list">
            {plan.conflicts.map((c) => (
              <li key={c.externalId}>
                <strong>{c.displayName}</strong>
                <div className="small error-text" dir="auto">
                  {c.reason}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <ul className="plain-list small muted" aria-label={ta('warnings')}>
          {plan.warnings.map((w) => (
            <li key={w} dir="auto">
              {preview.groups.reduce((text, g) => text.replace(g.dn, groupLabel(g.dn)), w)}
            </li>
          ))}
        </ul>
      )}
      <ChangeList
        title={ta('newPeople')}
        items={plan.creates.map((c) => ({
          key: c.externalId,
          main: c.displayName,
          detail: `${team(c.teamId)}${c.email ? `, ${c.email}` : ''}`,
        }))}
      />
      <ChangeList
        title={ta('linkedByEmail')}
        items={plan.links.map((l) => ({
          key: l.externalId,
          main: l.displayName,
          detail: ta('existingPerson'),
        }))}
      />
      <ChangeList
        title={ta('detailsUpdated')}
        items={plan.updates.map((u) => ({
          key: u.userId,
          main: u.to.displayName,
          detail: [
            u.from.displayName !== u.to.displayName && taf('wasName', { name: u.from.displayName }),
            u.from.email !== u.to.email &&
              (u.to.email ? taf('emailNow', { email: u.to.email }) : ta('emailRemoved')),
          ]
            .filter(Boolean)
            .join(', '),
        }))}
      />
      <ChangeList
        title={ta('joiningTeam')}
        items={plan.adds.map((a) => ({
          key: `${a.userId}:${a.teamId}`,
          main: a.displayName,
          detail: `${team(a.teamId)}${a.endMembershipIds.length ? `, ${ta('leavesCurrent')}` : ''}`,
        }))}
      />
      <ChangeList
        title={ta('leavingTeam')}
        items={plan.ends.map((e) => ({
          key: e.membershipId,
          main: e.displayName,
          detail: `${team(e.teamId)}, ${ta('endsToday')}`,
        }))}
      />
      <div className="actions">
        <span className="muted small actions-note">{ta('rolesNeverImported')}</span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={plan.total === 0 || run.pending}
          aria-busy={run.pending}
          onClick={apply}
        >
          {run.pending ? ta('applying') : count('applyChanges', plan.total)}
        </button>
      </div>
    </section>
  );
}

/** Map AD team groups to EPI teams, preview the import, apply exactly what was previewed. */
export function DirectoryTab() {
  const status = useApi<DirectoryStatus>('/api/v1/admin/directory');
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const [flash, setFlash] = useState<Flash>(null);
  const run = useMutation(setFlash);
  const [preview, setPreview] = useState<DirectoryPreview | null>(null);
  const [reading, setReading] = useState(false);

  if (status.state === 'loading') return <Skeleton lines={4} />;
  if (status.state === 'error') return <ErrorState error={status.error} onRetry={status.reload} />;
  const s = status.data;
  if (!s.configured) {
    return (
      <section className="panel" aria-labelledby="directory-title">
        <h2 id="directory-title">{ta('directoryImport')}</h2>
        <Empty>
          {ta('dirNotSetUp')} (<code translate="no">EPI_LDAP_*</code>)
        </Empty>
      </section>
    );
  }
  const teams =
    tree.state === 'ready'
      ? tree.data
          .flatMap((o) =>
            o.groups.flatMap((g) =>
              g.teams.map((t) => ({ id: t.id, name: `${t.name} (${g.name})` })),
            ),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  async function readDirectory() {
    setReading(true);
    setFlash(null);
    try {
      setPreview(await api.post<DirectoryPreview>('/api/v1/admin/directory/preview'));
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
    } finally {
      setReading(false);
    }
  }

  return (
    <>
      <section className="panel" aria-labelledby="directory-title">
        <h2 id="directory-title">{ta('directoryImport')}</h2>
        <p className="muted small">{ta('directoryIntro')}</p>
        <FlashMessage flash={flash} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{ta('directoryGroup')}</th>
                <th scope="col">{ta('epiTeam')}</th>
              </tr>
            </thead>
            <tbody>
              {s.groups.map((g) => (
                <tr key={g.dn}>
                  <td>
                    {groupLabel(g.dn)}
                    <div className="muted small" translate="no">
                      {g.dn}
                    </div>
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`map-${g.dn}`}>
                      {taf('epiTeamFor', { group: groupLabel(g.dn) })}
                    </label>
                    <select
                      id={`map-${g.dn}`}
                      value={g.teamId ?? ''}
                      disabled={run.pending}
                      onChange={(e) =>
                        run(
                          () =>
                            api.put('/api/v1/admin/directory/mappings', {
                              groupDn: g.dn,
                              teamId: e.target.value || null,
                            }),
                          e.target.value
                            ? taf('nowFeeds', {
                                group: groupLabel(g.dn),
                                team: teams.find((t) => t.id === e.target.value)?.name ?? '',
                              })
                            : taf('noLongerImported', { group: groupLabel(g.dn) }),
                          () => {
                            setPreview(null);
                            status.reload();
                          },
                        )
                      }
                    >
                      <option value="">{ta('notImported')}</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="actions">
          <span className="muted small actions-note">
            {s.lastImport
              ? taf('lastImport', { when: formatTime(s.lastImport.at) })
              : ta('noImportYet')}
          </span>
          <button
            type="button"
            className="btn"
            disabled={reading || !s.groups.some((g) => g.teamId)}
            aria-busy={reading}
            onClick={readDirectory}
          >
            {reading ? ta('readingDirectory') : ta('previewImport')}
          </button>
        </div>
      </section>
      {preview && (
        <PreviewView
          key={preview.hash + preview.readAt}
          preview={preview}
          run={run}
          onApplied={() => {
            setPreview(null);
            status.reload();
          }}
        />
      )}
    </>
  );
}
