import { FormEvent, useState } from 'react';
import { AdminSettings, api, SourceConnection } from '../../api';
import { ErrorState, Skeleton } from '../../components/States';
import { useApi } from '../../useApi';
import { groupLabel } from './Directory';
import { Flash, FlashMessage, useMutation } from './shared';
import { ta, taf } from './i18n-admin';

const KIND = { jira: 'Jira Data Center', gitlab: 'GitLab' } as const;
/** Default names of the server-side token secrets (names only, never values). */
const SECRET_NAME = { jira: 'EPI_JIRA_TOKEN', gitlab: 'EPI_GITLAB_TOKEN' } as const;
const splitProjects = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);

function TokenStatus({ c }: { c: SourceConnection }) {
  return c.tokenPresent ? (
    <span className="badge badge-managed">{ta('tokenFound')}</span>
  ) : (
    <span className="badge badge-bad">
      {ta('tokenMissing')} <code translate="no">{c.secretRef}_FILE</code>
    </span>
  );
}

function ConnectionForm({
  c,
  run,
  onSaved,
}: {
  c: SourceConnection;
  run: ReturnType<typeof useMutation>;
  onSaved: () => void;
}) {
  const [test, setTest] = useState<{ ok: boolean; summary: string } | null>(null);
  const [testing, setTesting] = useState(false);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setTest(null);
    void run(
      () =>
        api.put(`/api/v1/admin/settings/connections/${c.id}`, {
          url: String(d.get('url')),
          projects: splitProjects(String(d.get('projects'))),
          secretRef: String(d.get('secretRef')),
          enabled: d.get('enabled') === 'on',
        }),
      taf('connSaved', { name: c.name }),
      onSaved,
    );
  }

  async function check() {
    setTesting(true);
    setTest(null);
    try {
      setTest(
        await api.post<{ ok: boolean; summary: string }>(
          `/api/v1/admin/settings/connections/${c.id}/test`,
        ),
      );
    } catch (e) {
      setTest({ ok: false, summary: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="form-group" onSubmit={save} key={`${c.url}-${c.projects.join()}-${c.enabled}`}>
      <h3>
        <span translate="no">{c.name}</span> <span className="muted small">{KIND[c.kind]}</span>
      </h3>
      <TokenStatus c={c} />
      <div className="inline-form">
        <label className="inline-field">
          {ta('address')}
          <input
            name="url"
            type="url"
            defaultValue={c.url}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="inline-field">
          {ta(c.kind === 'jira' ? 'projectKeys' : 'projectIds')}
          <input
            name="projects"
            defaultValue={c.projects.join(', ')}
            required
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="inline-field">
          {ta('secretName')}
          <input
            name="secretRef"
            defaultValue={c.secretRef ?? ''}
            required
            autoComplete="off"
            spellCheck={false}
            translate="no"
          />
        </label>
        <label className="check-field">
          <input type="checkbox" name="enabled" defaultChecked={c.enabled} /> {ta('syncThis')}
        </label>
      </div>
      <div className="actions">
        {test && (
          <span
            role="status"
            className={`actions-note small ${test.ok ? 'ok-text' : 'error-text'}`}
          >
            {test.summary}
          </span>
        )}
        <button
          type="button"
          className="btn"
          onClick={check}
          disabled={testing}
          aria-busy={testing}
        >
          {testing ? ta('testing') : ta('testConnection')}
        </button>
        <button type="submit" className="btn btn-primary" disabled={run.pending}>
          {ta('save')}
        </button>
      </div>
    </form>
  );
}

function AddConnection({
  run,
  onSaved,
}: {
  run: ReturnType<typeof useMutation>;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<'jira' | 'gitlab'>('jira');
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const name = String(d.get('name'));
    void run(
      () =>
        api.post('/api/v1/admin/settings/connections', {
          kind,
          name,
          url: String(d.get('url')),
          projects: splitProjects(String(d.get('projects'))),
          secretRef: String(d.get('secretRef')) || undefined,
        }),
      taf('connAdded', { name }),
      () => {
        form.reset();
        onSaved();
      },
    );
  }
  return (
    <form className="form-group" onSubmit={add}>
      <h3>{ta('addConnection')}</h3>
      <div className="inline-form">
        <label className="inline-field">
          {ta('source')}
          <select value={kind} onChange={(e) => setKind(e.target.value as 'jira' | 'gitlab')}>
            <option value="jira">{KIND.jira}</option>
            <option value="gitlab">{KIND.gitlab}</option>
          </select>
        </label>
        <label className="inline-field">
          {ta('name')}
          <input
            name="name"
            required
            placeholder={kind === 'jira' ? 'jira-main…' : 'gitlab-main…'}
            pattern="[a-z0-9][a-z0-9-]{1,39}"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="inline-field">
          {ta('address')}
          <input
            name="url"
            type="url"
            required
            placeholder={
              kind === 'jira' ? 'https://jira.corp.example…' : 'https://gitlab.corp.example…'
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="inline-field">
          {ta(kind === 'jira' ? 'projectKeys' : 'projectIds')}
          <input
            name="projects"
            required
            placeholder={kind === 'jira' ? 'PAY, WEB…' : '12, 40…'}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="inline-field">
          {ta('secretNameOptional')}
          <input
            name="secretRef"
            placeholder={SECRET_NAME[kind]}
            autoComplete="off"
            spellCheck={false}
            translate="no"
          />
        </label>
        <button type="submit" className="btn" disabled={run.pending}>
          {ta('addConnectionBtn')}
        </button>
      </div>
    </form>
  );
}

/** Addresses of the sources EPI reads, plus the server settings that are fixed at install. */
export function SettingsTab() {
  const s = useApi<AdminSettings>('/api/v1/admin/settings');
  const [flash, setFlash] = useState<Flash>(null);
  const run = useMutation(setFlash);
  if (s.state === 'loading') return <Skeleton lines={6} />;
  if (s.state === 'error') return <ErrorState error={s.error} onRetry={s.reload} />;
  const { connections, rules, server } = s.data;

  return (
    <>
      <section className="panel" aria-labelledby="sources-title">
        <h2 id="sources-title">{ta('jiraGitlab')}</h2>
        <p className="muted small">
          {ta('sourcesIntro')}
          {rules.allowedHosts && (
            <> {taf('allowedHosts', { hosts: rules.allowedHosts.join(', ') })}</>
          )}
          {rules.httpAllowed && <> {ta('httpDemo')}</>}
        </p>
        <FlashMessage flash={flash} />
        {connections.length === 0 && <p className="muted">{ta('noConnections')}</p>}
        {connections.map((c) => (
          <ConnectionForm key={c.id} c={c} run={run} onSaved={s.reload} />
        ))}
        <AddConnection run={run} onSaved={s.reload} />
      </section>

      <section className="panel" aria-labelledby="signin-title">
        <h2 id="signin-title">{ta('signInDirectory')}</h2>
        <p className="muted small">
          {ta('signInIntro')} (<code translate="no">./epi.sh sso-setup</code>, docs/KEYCLOAK.md)
        </p>
        <dl className="defs">
          <dt>{ta('epiAddress')}</dt>
          <dd translate="no">{server.publicUrl}</dd>
          <dt>{ta('signIn')}</dt>
          <dd translate="no">{server.signIn ? server.signIn.issuer : ta('demoSignIn')}</dd>
          <dt>{ta('directory')}</dt>
          <dd>
            {server.directory ? (
              <>
                <span translate="no">{server.directory.url}</span>
                <div className="muted small">
                  {ta('teamGroups')}: {server.directory.teamGroups.map(groupLabel).join(', ')}
                </div>
              </>
            ) : (
              ta('notConfigured')
            )}
          </dd>
        </dl>
      </section>

      <section className="panel" aria-labelledby="privacy-title">
        <h2 id="privacy-title">{ta('privacyData')}</h2>
        <dl className="defs">
          <dt>{ta('minGroupSize')}</dt>
          <dd>{taf('minGroupSizeText', { n: server.minimumGroupSize })}</dd>
          <dt>{ta('dataRetention')}</dt>
          <dd>
            {server.retentionMonths === null
              ? ta('off')
              : taf('retentionText', { n: server.retentionMonths })}
          </dd>
        </dl>
        <p className="muted small">
          {ta('serverSettings')} (<code translate="no">EPI_MIN_AGGREGATE_SIZE</code>,{' '}
          <code translate="no">EPI_RETENTION_MONTHS</code>)
        </p>
      </section>
    </>
  );
}
