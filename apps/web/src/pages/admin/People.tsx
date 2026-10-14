import { FormEvent, useState } from 'react';
import { api, OrgNode, PersonDetail, PersonOption } from '../../api';
import { ErrorState, Skeleton } from '../../components/States';
import { useSession } from '../../session';
import { MessageKey, t } from '../../i18n';
import { useUrlParam } from '../../components/useUrlParam';
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

/** Which scopes each assignable role may use (mirrors the API's ROLE_SCOPES). */
const ROLES: {
  role: string;
  label: MessageKey;
  scopes: ('ORGANIZATION' | 'GROUP' | 'TEAM' | 'SYSTEM')[];
}[] = [
  { role: 'TEAM_LEAD', label: 'roleTeamLead', scopes: ['TEAM'] },
  { role: 'GROUP_MANAGER', label: 'roleGroupManager', scopes: ['GROUP'] },
  {
    role: 'ENGINEERING_MANAGER',
    label: 'roleEngineeringManager',
    scopes: ['ORGANIZATION', 'GROUP'],
  },
  { role: 'HR_PARTNER', label: 'roleHrPartner', scopes: ['ORGANIZATION', 'GROUP'] },
  { role: 'ADMIN', label: 'roleAdmin', scopes: ['SYSTEM'] },
];
const roleName = (role: string) => {
  const r = ROLES.find((x) => x.role === role);
  return r ? t(r.label) : role;
};

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

  if (person.state === 'loading') return <Skeleton lines={4} />;
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
      ta('detailsSaved'),
      reload,
    );
  }

  return (
    <section className="panel" aria-labelledby="person-title">
      <h2 id="person-title">
        {p.display_name} {!p.active && <span className="badge badge-bad">{ta('inactive')}</span>}
      </h2>
      <FlashMessage flash={flash} />
      <form className="inline-form" onSubmit={rename} key={`${p.display_name}-${p.email}`}>
        <label className="inline-field">
          {ta('name')}
          <input
            name="displayName"
            defaultValue={p.display_name}
            required
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <label className="inline-field">
          {ta('email')}
          <input
            name="email"
            type="email"
            defaultValue={p.email ?? ''}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={run.pending} className="btn">
          {ta('saveDetails')}
        </button>
        {!isSelf && (
          <button
            type="button"
            className={p.active ? 'btn btn-danger' : 'btn'}
            onClick={() =>
              (p.active
                ? window.confirm(taf('confirmDeactivatePerson', { name: p.display_name }))
                : true) &&
              run(
                () => api.patch(`/api/v1/admin/people/${p.id}`, { active: !p.active }),
                p.active ? ta('personDeactivated') : ta('personReactivated'),
                reload,
              )
            }
          >
            {p.active ? ta('deactivate') : ta('reactivate')}
          </button>
        )}
      </form>

      <h3>{ta('teams')}</h3>
      {p.memberships.length === 0 ? (
        <p className="muted">{ta('notInTeam')}</p>
      ) : (
        <ul className="plain-list history-list" aria-label={ta('teamHistory')}>
          {p.memberships.map((m) => (
            <li key={m.id}>
              <span>
                {m.team_name} <span className="muted small">{m.group_name}</span>
              </span>
              <span className="muted small">
                {shortDate(m.effective_from)} –{' '}
                {m.effective_to ? shortDate(m.effective_to) : ta('now')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>{ta('roles')}</h3>
      {isSelf && <p className="muted small">{ta('ownRoles')}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{ta('role')}</th>
              <th scope="col">{ta('scope')}</th>
              <th scope="col">{ta('period')}</th>
              <th scope="col">
                <span className="sr-only">{ta('actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('roleDeveloper')}</td>
              <td className="muted">{ta('ownDataImplicit')}</td>
              <td>—</td>
              <td />
            </tr>
            {p.roles.map((r) => (
              <tr key={r.id}>
                <td>{roleName(r.role)}</td>
                <td>{r.scope_type === 'SYSTEM' ? ta('system') : r.scope_name}</td>
                <td>
                  {shortDate(r.effective_from)} –{' '}
                  {r.effective_to ? shortDate(r.effective_to) : ta('now')}
                </td>
                <td className="cell-actions">
                  {!r.effective_to && !isSelf && (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        window.confirm(
                          taf('confirmEndRole', { role: roleName(r.role), name: p.display_name }),
                        ) &&
                        run(
                          () => api.post(`/api/v1/admin/role-assignments/${r.id}/end`, {}),
                          ta('roleEnded'),
                          reload,
                        )
                      }
                    >
                      {ta('endRole')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              ta('roleAssigned'),
              reload,
            );
          }}
        >
          <label className="inline-field">
            {ta('role')}
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
                  {t(r.label)}
                </option>
              ))}
            </select>
          </label>
          {def.scopes.length > 1 && (
            <label className="inline-field">
              {ta('level')}
              <select
                value={scopeType}
                onChange={(e) => (setScopeType(e.target.value), setScopeId(''))}
              >
                {def.scopes.map((s) => (
                  <option key={s} value={s}>
                    {s === 'ORGANIZATION' ? ta('levelOrganization') : ta('levelGroup')}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scopeType !== 'SYSTEM' && (
            <label className="inline-field">
              {ta('scope')}
              <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} required>
                <option value="">{ta('choose')}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={run.pending} className="btn btn-primary">
            {ta('assignRole')}
          </button>
        </form>
      )}

      <h3>{ta('grade')}</h3>
      <ul className="plain-list history-list" aria-label={ta('gradeHistory')}>
        {p.grades.map((g) => (
          <li key={g.id}>
            <span>{g.label}</span>
            <span className="muted small">
              {shortDate(g.effective_from)} –{' '}
              {g.effective_to ? shortDate(g.effective_to) : ta('now')}
            </span>
          </li>
        ))}
        {p.grades.length === 0 && <li className="muted">{ta('noGrade')}</li>}
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
            ta('gradeUpdated'),
            reload,
          );
        }}
      >
        <label className="inline-field">
          {ta('newGrade')}
          <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
            <option value="">{ta('choose')}</option>
            {grades.state === 'ready' &&
              grades.data.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.label}
                </option>
              ))}
          </select>
        </label>
        <label className="inline-field">
          {ta('from')}
          <input
            type="date"
            value={gradeFrom}
            max={today()}
            onChange={(e) => setGradeFrom(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={run.pending} className="btn">
          {ta('setGrade')}
        </button>
      </form>
    </section>
  );
}

/** Find or create people; manage their roles and grades. */
export function PeopleTab() {
  // UX-062: the selected person is in the URL (?person=<id>).
  const [personId, setPersonId] = useUrlParam('person');
  const setSelected = (p: PersonOption | null) => setPersonId(p?.id ?? null);
  const [flash, setFlash] = useState<Flash>(null);
  const run = useMutation(setFlash);

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get('displayName'));
    void run(
      async () => {
        const p = await api.post<{ id: string; displayName: string; email: string | null }>(
          '/api/v1/admin/people',
          {
            displayName,
            email: String(data.get('email')) || null,
          },
        );
        setSelected({ id: p.id, display_name: p.displayName, email: p.email, identities: null });
        form.reset();
      },
      taf('personCreated', { name: displayName }),
    );
  }

  return (
    <>
      <section className="panel" aria-labelledby="people-title">
        <h2 id="people-title">{ta('tabPeople')}</h2>
        <p className="muted small">{ta('peopleIntro')}</p>
        <FlashMessage flash={flash} />
        <div className="form-group">
          <h3>{ta('findPerson')}</h3>
          <PersonSearch label={ta('findPersonPlaceholder')} onPick={setSelected} />
        </div>
        <div className="form-group">
          <h3>{ta('addPerson')}</h3>
          <form className="inline-form" onSubmit={create}>
            <label className="inline-field">
              {ta('fullName')}
              <input name="displayName" required maxLength={120} autoComplete="off" />
            </label>
            <label className="inline-field">
              {ta('emailOptional')}
              <input
                name="email"
                type="email"
                maxLength={200}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" disabled={run.pending} className="btn">
              {ta('addPersonBtn')}
            </button>
          </form>
        </div>
      </section>
      {personId && <PersonPanel key={personId} id={personId} onChanged={() => undefined} />}
    </>
  );
}
