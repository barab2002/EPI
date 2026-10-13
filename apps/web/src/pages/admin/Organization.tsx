import { FormEvent, useState } from 'react';
import { api, GroupNode, Membership, OrgNode, PersonOption, TeamNode } from '../../api';
import { ErrorState, Skeleton } from '../../components/States';
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
import { ta, taf } from './i18n-admin';

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
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await onSave(value.trim());
      setValue('');
    } finally {
      setBusy(false);
    }
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
      <button type="submit" className="btn" disabled={busy || !value.trim()}>
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
      <h2 id={`team-${team.id}`}>{taf('membersOf', { team: team.name })}</h2>
      <div className="inline-form">
        <InlineName
          label={taf('renameX', { name: team.name })}
          action={ta('rename')}
          onSave={(name) =>
            run(
              () => api.patch(`/api/v1/admin/teams/${team.id}`, { name }),
              taf('teamRenamed', { name }),
              onChanged,
            )
          }
        />
        <label className="inline-field">
          {ta('moveToGroup')}
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              run(
                () => api.patch(`/api/v1/admin/teams/${team.id}`, { groupId: e.target.value }),
                taf('teamMoved', { name: team.name }),
                onChanged,
              )
            }
          >
            <option value="">{ta('choose')}</option>
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
            window.confirm(taf('confirmDeactivateTeam', { name: team.name })) &&
            run(
              () => api.patch(`/api/v1/admin/teams/${team.id}`, { active: false }),
              taf('teamDeactivated', { name: team.name }),
              onChanged,
            )
          }
        >
          {ta('deactivateTeam')}
        </button>
      </div>
      {members.state === 'loading' && <Skeleton lines={4} />}
      {members.state === 'error' && <ErrorState error={members.error} onRetry={members.reload} />}
      {members.state === 'ready' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{ta('person')}</th>
                <th scope="col">{ta('since')}</th>
                <th scope="col">
                  <span className="sr-only">{ta('actions')}</span>
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
                          taf('confirmEndMembership', { name: m.display_name, team: team.name }),
                        ) &&
                        run(
                          () => api.post(`/api/v1/admin/memberships/${m.id}/end`, {}),
                          taf('leftTeam', { name: m.display_name, team: team.name }),
                          reload,
                        )
                      }
                    >
                      {ta('endMembership')}
                    </button>
                  </td>
                </tr>
              ))}
              {current.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    {ta('noCurrentMembers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {past.length > 0 && (
        <details>
          <summary className="small">{taf('pastMembers', { n: past.length })}</summary>
          <ul className="small">
            {past.map((m) => (
              <li key={m.id}>
                {m.display_name}: {shortDate(m.effective_from)} – {shortDate(m.effective_to)}
              </li>
            ))}
          </ul>
        </details>
      )}
      <h3>{ta('addMember')}</h3>
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
              taf('addedToTeam', { name: person.display_name, team: team.name }),
              () => {
                setPerson(null);
                reload();
              },
            );
          }}
        >
          <strong className="form-subject">{person.display_name}</strong>
          <label className="inline-field">
            {ta('from')}
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
            {ta('transfer')}
          </label>
          <button type="submit" disabled={run.pending} className="btn btn-primary">
            {ta('add')}
          </button>
          <button type="button" className="btn" onClick={() => setPerson(null)}>
            {ta('cancel')}
          </button>
        </form>
      ) : (
        <PersonSearch label={ta('findPersonToAdd')} onPick={setPerson} />
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
  if (tree.state === 'loading') return <Skeleton lines={4} />;
  if (tree.state === 'error') return <ErrorState error={tree.error} onRetry={tree.reload} />;
  const groups = tree.data.flatMap((o) => o.groups);
  const team = groups.flatMap((g) => g.teams).find((t) => t.id === selected);

  return (
    <>
      <section className="panel" aria-labelledby="org-structure-title">
        <h2 id="org-structure-title">{ta('groupsAndTeams')}</h2>
        <p className="muted small">{ta('orgIntro')}</p>
        <FlashMessage flash={flash} />
        {tree.data.map((org) => (
          <div key={org.id}>
            <h3>{org.name}</h3>
            <InlineName
              label={ta('newGroupName')}
              action={ta('addGroup')}
              onSave={(name) =>
                run(
                  () => api.post('/api/v1/admin/groups', { organizationId: org.id, name }),
                  taf('groupCreated', { name }),
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
                      <summary className="small">{ta('renameAddTeam')}</summary>
                      <InlineName
                        label={taf('renameX', { name: g.name })}
                        action={ta('rename')}
                        onSave={(name) =>
                          run(
                            () => api.patch(`/api/v1/admin/groups/${g.id}`, { name }),
                            taf('groupRenamed', { name }),
                            tree.reload,
                          )
                        }
                      />
                      <InlineName
                        label={taf('newTeamIn', { group: g.name })}
                        action={ta('addTeam')}
                        onSave={(name) =>
                          run(
                            () => api.post('/api/v1/admin/teams', { groupId: g.id, name }),
                            taf('teamCreated', { name }),
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
                          <span className="muted small">
                            {taf(t.memberCount === 1 ? 'memberCountOne' : 'memberCountMany', {
                              n: t.memberCount,
                            })}
                          </span>
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
