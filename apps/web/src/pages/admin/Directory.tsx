import { useState } from 'react';
import { api, DirectoryPreview, DirectoryStatus, ImportPlan, OrgNode } from '../../api';
import { Empty, ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { formatTime } from './Admin';
import { Flash, FlashMessage, useMutation } from './shared';

/** "cn=Team-Payments,ou=Groups,…" → "Team-Payments". */
export const groupLabel = (dn: string) => /^cn=([^,]+)/i.exec(dn)?.[1] ?? dn;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One sentence that says what applying will do (the confirmation repeats it). */
export function planSummary(p: ImportPlan): string {
  const parts = [
    p.creates.length && `add ${plural(p.creates.length, 'new person', 'new people')}`,
    p.links.length &&
      `link ${plural(p.links.length, 'existing person', 'existing people')} by e-mail`,
    p.updates.length && `update the details of ${plural(p.updates.length, 'person', 'people')}`,
    p.adds.length && `move ${plural(p.adds.length, 'person', 'people')} into a team`,
    p.ends.length && `remove ${plural(p.ends.length, 'person', 'people')} from a team`,
  ].filter(Boolean) as string[];
  if (!parts.length) return 'EPI already matches the directory. Nothing to change.';
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `Applying will ${text}.`;
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
  const team = (id: string) => teamNames[id] ?? 'Unknown team';

  function apply() {
    const ends = plan.ends.length
      ? ` ${plural(plan.ends.length, 'membership')} will end today; history is kept.`
      : '';
    if (!window.confirm(`${planSummary(plan)}${ends} Continue?`)) return;
    void run(
      () => api.post('/api/v1/admin/directory/apply', { hash: preview.hash }),
      'Import applied. Every change is in the audit log.',
      onApplied,
    );
  }

  return (
    <section className="panel" aria-labelledby="preview-title">
      <h2 id="preview-title">Preview</h2>
      <p className="muted small">
        Read from the directory at {formatTime(preview.readAt)}. Nothing has changed yet.
      </p>
      <p>{planSummary(plan)}</p>
      {plan.conflicts.length > 0 && (
        <div className="form-group">
          <h3>
            Skipped: needs your attention{' '}
            <span className="badge badge-bad">{plan.conflicts.length}</span>
          </h3>
          <ul className="plain-list">
            {plan.conflicts.map((c) => (
              <li key={c.externalId}>
                <strong>{c.displayName}</strong>
                <div className="small error-text">{c.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.warnings.length > 0 && (
        <ul className="plain-list small muted" aria-label="Warnings">
          {plan.warnings.map((w) => (
            <li key={w}>
              {preview.groups.reduce((text, g) => text.replace(g.dn, groupLabel(g.dn)), w)}
            </li>
          ))}
        </ul>
      )}
      <ChangeList
        title="New people"
        items={plan.creates.map((c) => ({
          key: c.externalId,
          main: c.displayName,
          detail: `${team(c.teamId)}${c.email ? `, ${c.email}` : ''}`,
        }))}
      />
      <ChangeList
        title="Linked by e-mail"
        items={plan.links.map((l) => ({
          key: l.externalId,
          main: l.displayName,
          detail: 'existing EPI person',
        }))}
      />
      <ChangeList
        title="Details updated"
        items={plan.updates.map((u) => ({
          key: u.userId,
          main: u.to.displayName,
          detail: [
            u.from.displayName !== u.to.displayName && `was “${u.from.displayName}”`,
            u.from.email !== u.to.email && `e-mail ${u.to.email ?? 'removed'}`,
          ]
            .filter(Boolean)
            .join(', '),
        }))}
      />
      <ChangeList
        title="Joining a team"
        items={plan.adds.map((a) => ({
          key: `${a.userId}:${a.teamId}`,
          main: a.displayName,
          detail: `${team(a.teamId)}${a.endMembershipIds.length ? ', leaves their current team' : ''}`,
        }))}
      />
      <ChangeList
        title="Leaving a team"
        items={plan.ends.map((e) => ({
          key: e.membershipId,
          main: e.displayName,
          detail: `${team(e.teamId)}, ends today`,
        }))}
      />
      <div className="actions">
        <span className="muted small actions-note">
          Roles are never imported, and nobody is deactivated: assign roles under People.
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={plan.total === 0 || run.pending}
          aria-busy={run.pending}
          onClick={apply}
        >
          {run.pending ? 'Applying…' : `Apply ${plural(plan.total, 'change')}`}
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
        <h2 id="directory-title">Directory import</h2>
        <Empty>
          The directory import is not set up on this server. Set the{' '}
          <code translate="no">EPI_LDAP_*</code> settings (read-only LDAPS account and the team
          groups) as described in the installation guide, then restart EPI.
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
        <h2 id="directory-title">Directory import</h2>
        <p className="muted small">
          Team groups in Active Directory decide who belongs to the EPI teams they are mapped to.
          Teams without a group stay managed by hand. EPI only reads the directory, and you see
          every change before it happens.
        </p>
        <FlashMessage flash={flash} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Directory group</th>
                <th scope="col">EPI team</th>
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
                      EPI team for {groupLabel(g.dn)}
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
                            ? `${groupLabel(g.dn)} now feeds ${teams.find((t) => t.id === e.target.value)?.name ?? 'the team'}.`
                            : `${groupLabel(g.dn)} is no longer imported.`,
                          () => {
                            setPreview(null);
                            status.reload();
                          },
                        )
                      }
                    >
                      <option value="">Not imported</option>
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
              ? `Last import: ${formatTime(s.lastImport.at)}.`
              : 'No import has been applied yet.'}
          </span>
          <button
            type="button"
            className="btn"
            disabled={reading || !s.groups.some((g) => g.teamId)}
            aria-busy={reading}
            onClick={readDirectory}
          >
            {reading ? 'Reading the directory…' : 'Preview import'}
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
