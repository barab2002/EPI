import { FormEvent, useState } from 'react';
import { api, OrgNode, PersonDetail, PersonOption } from '../../api';
import { ErrorState, Loading } from '../../components/States';
import { useSession } from '../../session';
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

/** Which scopes each assignable role may use (mirrors the API's ROLE_SCOPES). */
const ROLES: {
  role: string;
  label: string;
  scopes: ('ORGANIZATION' | 'GROUP' | 'TEAM' | 'SYSTEM')[];
}[] = [
  { role: 'TEAM_LEAD', label: 'Team lead', scopes: ['TEAM'] },
  { role: 'GROUP_MANAGER', label: 'Group manager', scopes: ['GROUP'] },
  { role: 'ENGINEERING_MANAGER', label: 'Engineering manager', scopes: ['ORGANIZATION', 'GROUP'] },
  { role: 'HR_PARTNER', label: 'HR partner', scopes: ['ORGANIZATION', 'GROUP'] },
  { role: 'ADMIN', label: 'Administrator', scopes: ['SYSTEM'] },
];

function scopeOptions(tree: OrgNode[], type: string): { id: string; name: string }[] {
  if (type === 'ORGANIZATION') return tree.map((o) => ({ id: o.id, name: o.name }));
  if (type === 'GROUP')
    return tree.flatMap((o) => o.groups.map((g) => ({ id: g.id, name: g.name })));
  if (type === 'TEAM') {
    return tree.flatMap((o) =>
      o.groups.flatMap((g) => g.teams.map((t) => ({ id: t.id, name: `${t.name} (${g.name})` }))),
    );
  }
  return [];
}

function PersonPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { me } = useSession();
  const person = useApi<PersonDetail>(`/api/v1/admin/people/${id}`);
  const tree = useApi<OrgNode[]>('/api/v1/organization/tree');
  const grades = useApi<{ code: string; label: string }[]>('/api/v1/admin/grades');
  const [flash, setFlash] = useState<Flash>(null);
  const run = useMutation(setFlash);
  const [role, setRole] = useState(ROLES[0].role);
  const def = ROLES.find((r) => r.role === role)!;
  const [scopeType, setScopeType] = useState<string>(def.scopes[0]);
  const [scopeId, setScopeId] = useState('');
  const [grade, setGrade] = useState('');
  const [gradeFrom, setGradeFrom] = useState(today());
  const reload = () => {
    person.reload();
    onChanged();
  };

  if (person.state === 'loading') return <Loading />;
  if (person.state === 'error') return <ErrorState error={person.error} onRetry={person.reload} />;
  const p = person.data;
  const isSelf = p.id === me.user.id;
  const options = tree.state === 'ready' ? scopeOptions(tree.data, scopeType) : [];

  function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(
      () =>
        api.patch(`/api/v1/admin/people/${p.id}`, {
          displayName: String(data.get('displayName')),
          email: String(data.get('email')) || null,
        }),
      'Details saved.',
      reload,
    );
  }

  return (
    <section className="panel" aria-labelledby="person-title">
      <h2 id="person-title">
        {p.display_name} {!p.active && <span className="badge badge-bad">Inactive</span>}
      </h2>
      <FlashMessage flash={flash} />
      <form className="inline-form" onSubmit={rename} key={`${p.display_name}-${p.email}`}>
        <label className="inline-field">
          Name <input name="displayName" defaultValue={p.display_name} required maxLength={120} />
        </label>
        <label className="inline-field">
          E-mail <input name="email" type="email" defaultValue={p.email ?? ''} maxLength={200} />
        </label>
        <button type="submit" className="btn">
          Save
        </button>
        {!isSelf && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              (p.active
                ? window.confirm(
                    `Deactivate ${p.display_name}? They are signed out immediately; history is kept.`,
                  )
                : true) &&
              run(
                () => api.patch(`/api/v1/admin/people/${p.id}`, { active: !p.active }),
                p.active ? 'Person deactivated.' : 'Person reactivated.',
                reload,
              )
            }
          >
            {p.active ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </form>

      <h3>Teams</h3>
      {p.memberships.length === 0 ? (
        <p className="muted">Not in any team. Add them from the Organization tab.</p>
      ) : (
        <ul>
          {p.memberships.map((m) => (
            <li key={m.id}>
              {m.team_name} <span className="muted small">({m.group_name})</span>:{' '}
              {shortDate(m.effective_from)} – {m.effective_to ? shortDate(m.effective_to) : 'now'}
            </li>
          ))}
        </ul>
      )}

      <h3>Roles</h3>
      {isSelf && (
        <p className="muted small">You cannot change your own roles — ask another administrator.</p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Role</th>
            <th scope="col">Scope</th>
            <th scope="col">Period</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Developer</td>
            <td className="muted">own data (implicit)</td>
            <td>—</td>
            <td />
          </tr>
          {p.roles.map((r) => (
            <tr key={r.id}>
              <td>{ROLES.find((x) => x.role === r.role)?.label ?? r.role}</td>
              <td>{r.scope_type === 'SYSTEM' ? 'System' : r.scope_name}</td>
              <td>
                {shortDate(r.effective_from)} – {r.effective_to ? shortDate(r.effective_to) : 'now'}
              </td>
              <td>
                {!r.effective_to && !isSelf && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      window.confirm(
                        `End this ${r.role.toLowerCase().replace('_', ' ')} role today?`,
                      ) &&
                      run(
                        () => api.post(`/api/v1/admin/role-assignments/${r.id}/end`, {}),
                        'Role ended.',
                        reload,
                      )
                    }
                  >
                    End role
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!isSelf && p.active && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api.post('/api/v1/admin/role-assignments', {
                  userId: p.id,
                  role,
                  scopeType,
                  scopeId: scopeType === 'SYSTEM' ? null : scopeId,
                }),
              'Role assigned.',
              reload,
            );
          }}
        >
          <label className="inline-field">
            Role{' '}
            <select
              value={role}
              onChange={(e) => {
                const next = ROLES.find((r) => r.role === e.target.value)!;
                setRole(next.role);
                setScopeType(next.scopes[0]);
                setScopeId('');
              }}
            >
              {ROLES.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {def.scopes.length > 1 && (
            <label className="inline-field">
              On{' '}
              <select
                value={scopeType}
                onChange={(e) => (setScopeType(e.target.value), setScopeId(''))}
              >
                {def.scopes.map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scopeType !== 'SYSTEM' && (
            <label className="inline-field">
              Scope{' '}
              <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                <option value="">Choose…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="btn btn-primary">
            Assign role
          </button>
        </form>
      )}

      <h3>Grade</h3>
      <ul>
        {p.grades.map((g) => (
          <li key={g.id}>
            {g.label}: {shortDate(g.effective_from)} –{' '}
            {g.effective_to ? shortDate(g.effective_to) : 'now'}
          </li>
        ))}
        {p.grades.length === 0 && <li className="muted">No grade recorded.</li>}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api.post(`/api/v1/admin/people/${p.id}/grade`, {
                gradeCode: grade,
                effectiveFrom: dateToIso(gradeFrom),
              }),
            'Grade updated.',
            reload,
          );
        }}
      >
        <label className="inline-field">
          New grade{' '}
          <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
            <option value="">Choose…</option>
            {grades.state === 'ready' &&
              grades.data.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
          </select>
        </label>
        <label className="inline-field">
          from{' '}
          <input
            type="date"
            value={gradeFrom}
            max={today()}
            onChange={(e) => setGradeFrom(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn">
          Set grade
        </button>
      </form>
    </section>
  );
}

/** Find or create people; manage their roles and grades. */
export function PeopleTab() {
  const [selected, setSelected] = useState<PersonOption | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const run = useMutation(setFlash);

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get('displayName'));
    void run(async () => {
      const p = await api.post<{ id: string; displayName: string; email: string | null }>(
        '/api/v1/admin/people',
        {
          displayName,
          email: String(data.get('email')) || null,
        },
      );
      setSelected({ id: p.id, display_name: p.displayName, email: p.email, identities: null });
      form.reset();
    }, `${displayName} created.`);
  }

  return (
    <>
      <section className="panel" aria-labelledby="people-title">
        <h2 id="people-title">People</h2>
        <FlashMessage flash={flash} />
        <div className="toolbar">
          <PersonSearch label="Find a person…" onPick={setSelected} />
          <form className="inline-form" onSubmit={create}>
            <label className="inline-field">
              New person{' '}
              <input name="displayName" placeholder="Full name" required maxLength={120} />
            </label>
            <label>
              <span className="sr-only">E-mail</span>
              <input name="email" type="email" placeholder="E-mail (optional)" maxLength={200} />
            </label>
            <button type="submit" className="btn">
              Create
            </button>
          </form>
        </div>
      </section>
      {selected && <PersonPanel key={selected.id} id={selected.id} onChanged={() => undefined} />}
    </>
  );
}
