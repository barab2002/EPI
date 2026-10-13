import { FormEvent, useState } from 'react';
import { api, GroupNode, Membership, OrgNode, PersonOption, TeamNode } from '../../api';
import { ErrorState, Loading } from '../../components/States';
import { useApi } from '../../useApi';
import {
  dateToIso,
  Flash,
  FlashMessage,
  PersonSearch,
  shortDate,
  today,
  useMutation,
} from './shared';

function InlineName({
  label,
  action,
  onSave,
}: {
  label: string;
  action: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    await onSave(value.trim());
    setValue('');
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <label>
        <span className="sr-only">{label}</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${label}…`}
          maxLength={100}
          autoComplete="off"
        />
      </label>
      <button type="submit" className="btn" disabled={!value.trim()}>
        {action}
      </button>
    </form>
  );
}

function TeamMembers({
  team,
  groups,
  run,
  onChanged,
}: {
  team: TeamNode;
  groups: GroupNode[];
  run: ReturnType<typeof useMutation>;
  onChanged: () => void;
}) {
  const members = useApi<Membership[]>(`/api/v1/admin/teams/${team.id}/memberships`);
  const [person, setPerson] = useState<PersonOption | null>(null);
  const [from, setFrom] = useState(today());
  const [transfer, setTransfer] = useState(true);
  const current = members.state === 'ready' ? members.data.filter((m) => !m.effective_to) : [];
  const past = members.state === 'ready' ? members.data.filter((m) => m.effective_to) : [];
  const reload = () => {
    members.reload();
    onChanged();
  };

  return (
    <section className="panel" aria-labelledby={`team-${team.id}`}>
      <h2 id={`team-${team.id}`}>Members of {team.name}</h2>
      <div className="inline-form">
        <InlineName
          label={`Rename ${team.name}`}
          action="Rename"
          onSave={(name) =>
            run(
              () => api.patch(`/api/v1/admin/teams/${team.id}`, { name }),
              `Team renamed to ${name}.`,
              onChanged,
            )
          }
        />
        <label className="inline-field">
          Move to group
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              run(
                () => api.patch(`/api/v1/admin/teams/${team.id}`, { groupId: e.target.value }),
                `${team.name} moved.`,
                onChanged,
              )
            }
          >
            <option value="">Choose…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() =>
            window.confirm(
              `Deactivate ${team.name}? It disappears from navigation; its history and KPIs are kept.`,
            ) &&
            run(
              () => api.patch(`/api/v1/admin/teams/${team.id}`, { active: false }),
              `${team.name} deactivated.`,
              onChanged,
            )
          }
        >
          Deactivate team
        </button>
      </div>
      {members.state === 'loading' && <Loading />}
      {members.state === 'error' && <ErrorState error={members.error} onRetry={members.reload} />}
      {members.state === 'ready' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Since</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {current.map((m) => (
                <tr key={m.id}>
                  <td>{m.display_name}</td>
                  <td className="nowrap">{shortDate(m.effective_from)}</td>
                  <td className="cell-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        window.confirm(
                          `End ${m.display_name}’s membership in ${team.name} today?`,
                        ) &&
                        run(
                          () => api.post(`/api/v1/admin/memberships/${m.id}/end`, {}),
                          `${m.display_name} left ${team.name}.`,
                          reload,
                        )
                      }
                    >
                      End membership
                    </button>
                  </td>
                </tr>
              ))}
              {current.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No current members.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {past.length > 0 && (
        <details>
          <summary className="small">Past members ({past.length})</summary>
          <ul className="small">
            {past.map((m) => (
              <li key={m.id}>
                {m.display_name}: {shortDate(m.effective_from)} – {shortDate(m.effective_to)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h4>Add a member</h4>
      {person ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api.post('/api/v1/admin/memberships', {
                  userId: person.id,
                  teamId: team.id,
                  effectiveFrom: dateToIso(from),
                  transfer,
                }),
              `${person.display_name} added to ${team.name}.`,
              () => {
                setPerson(null);
                reload();
              },
            );
          }}
        >
          <strong className="form-subject">{person.display_name}</strong>
          <label className="inline-field">
            From
            <input
              type="date"
              value={from}
              max={today()}
              onChange={(e) => setFrom(e.target.value)}
              required
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={transfer}
              onChange={(e) => setTransfer(e.target.checked)}
            />{' '}
            Transfer (end their other team memberships)
          </label>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
          <button type="button" className="btn" onClick={() => setPerson(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <PersonSearch label="Find a person to add…" onPick={setPerson} />
      )}
    </section>
  );
}

/** Groups and teams of the organization, with team membership management. */
export function OrganizationTab() {
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const [flash, setFlash] = useState<Flash>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const run = useMutation(setFlash);
  if (tree.state === 'loading') return <Loading />;
  if (tree.state === 'error') return <ErrorState error={tree.error} onRetry={tree.reload} />;
  const groups = tree.data.flatMap((o) => o.groups);
  const team = groups.flatMap((g) => g.teams).find((t) => t.id === selected);

  return (
    <>
      <section className="panel" aria-labelledby="org-structure-title">
        <h2 id="org-structure-title">Groups and teams</h2>
        <p className="muted small">
          Changes take effect immediately for access (e.g. moving a team changes which group manager
          sees it). Nothing is deleted: memberships end with a date so historical KPIs stay
          attributed correctly.
        </p>
        <FlashMessage flash={flash} />
        {tree.data.map((org) => (
          <div key={org.id}>
            <h3>{org.name}</h3>
            <InlineName
              label="New group name"
              action="Add group"
              onSave={(name) =>
                run(
                  () => api.post('/api/v1/admin/groups', { organizationId: org.id, name }),
                  `Group ${name} created.`,
                  tree.reload,
                )
              }
            />
            <ul className="tree">
              {org.groups.map((g) => (
                <li key={g.id}>
                  <div className="tree-row">
                    <strong>{g.name}</strong>
                    <details className="inline-details">
                      <summary className="small">Rename / add team</summary>
                      <InlineName
                        label={`Rename ${g.name}`}
                        action="Rename"
                        onSave={(name) =>
                          run(
                            () => api.patch(`/api/v1/admin/groups/${g.id}`, { name }),
                            `Group renamed to ${name}.`,
                            tree.reload,
                          )
                        }
                      />
                      <InlineName
                        label={`New team in ${g.name}`}
                        action="Add team"
                        onSave={(name) =>
                          run(
                            () => api.post('/api/v1/admin/teams', { groupId: g.id, name }),
                            `Team ${name} created.`,
                            tree.reload,
                          )
                        }
                      />
                    </details>
                  </div>
                  <ul>
                    {g.teams.map((t) => (
                      <li key={t.id} className="tree-row">
                        <button
                          type="button"
                          className="link-btn"
                          aria-pressed={selected === t.id}
                          onClick={() => setSelected(t.id)}
                        >
                          {t.name}
                        </button>
                        {t.memberCount !== null && (
                          <span className="muted small">{t.memberCount} members</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      {team && (
        <TeamMembers key={team.id} team={team} groups={groups} run={run} onChanged={tree.reload} />
      )}
    </>
  );
}
