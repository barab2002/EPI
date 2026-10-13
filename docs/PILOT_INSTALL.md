# Pilot install guide (2026-11-02 pilot)

From a bundle built on your machine to the first sync and a checked set of numbers. Every command
here exists in this version and is covered by a test (named at the end). **Never paste a password
or token into chat, a ticket, Markdown or Git**: each goes into a file on the server, or into a
hidden prompt (`./epi.sh source-token`).

Before real employee data goes in, HR/privacy must sign off (ACCESS_REQUIREMENTS B7/C8).

## 0. What to collect first

| From | What | Where it goes |
|---|---|---|
| IT (server) | Internal Linux host, Docker 24+ with Compose v2, 2 CPU, 4 GB RAM, 5 GB disk; network routes to Jira, GitLab and a domain controller (636) | — |
| IT (network) | Two HTTPS names on a TLS front end (e.g. `epi.corp…`, `epi-sso.corp…`) forwarding to `127.0.0.1:8080` and `127.0.0.1:8081` on the host | `EPI_PUBLIC_URL`, `EPI_SSO_PUBLIC_URL` |
| IT (AD) | Read-only bind account (DN), LDAPS URL, users OU, groups OU, one AD group per pilot team, the CA certificate of the domain controllers (PEM) | `.epi/sso.conf`, password file, CA file |
| You | Your Jira personal access token; Jira URL and project keys | `./epi.sh source-token EPI_JIRA_TOKEN`, Settings |
| GitLab admin | Group/project token with `read_api`; GitLab URL and project IDs | `./epi.sh source-token EPI_GITLAB_TOKEN`, Settings |
| IT (PKI) | CA certificate of Jira's/GitLab's HTTPS certificates, if internal | `./epi.sh source-ca` |

Exposing EPI beyond the host (the TLS front end) is a network change: it needs your approval and IT's.

## 1. Build the bundle (your connected machine)

```bash
git pull && ./epi.sh test          # optional: the full checks
./epi.sh bundle                    # dist/epi-bundle-<version>-<arch>.tar + .tar.sha256 (with Keycloak)
```

Copy **both** files to the server. Read the `.sha256` value to whoever installs, over a second channel.

## 2. Install on the server (no internet needed)

```bash
tar -xOf epi-bundle-<version>-<arch>.tar --wildcards '*/epi.sh' > epi.sh && chmod +x epi.sh
./epi.sh offline-install epi-bundle-<version>-<arch>.tar --dir /opt/epi
cd /opt/epi && ./epi.sh doctor     # all PASS (WARN on RAM/CPU is acceptable for the pilot)
```

## 3. Sign-in with Active Directory

```bash
mkdir -p .epi/sso && chmod 700 .epi .epi/sso
cp deploy/sso.conf.example .epi/sso.conf && vi .epi/sso.conf
#   EPI_PUBLIC_URL / EPI_SSO_PUBLIC_URL, EPI_LDAP_* from IT, EPI_LDAP_TEAM_GROUPS (";"-separated),
#   EPI_SOURCE_HOSTS=jira.corp…,gitlab.corp… (recommended), EPI_RETENTION_MONTHS (default 24)
sudo install -m 600 /dev/null .epi/sso/ldap_bind_password && sudo vi .epi/sso/ldap_bind_password
cp /path/to/dc-ca.pem .epi/sso/ldap-ca.pem
./epi.sh sso-setup
./epi.sh start
./epi.sh cli directory-check
#   lists every team group with its member count; fix sso.conf if a group shows 0 or an error
```

## 4. First administrator

An empty installation has no people, and sign-in never creates accounts. Make yourself the first
administrator, with the e-mail AD holds for you:

```bash
./epi.sh cli setup-admin --name "Your Name" --email you@corp… --org "Your Company"
```

Then open `EPI_PUBLIC_URL`, choose **Sign in with your organization account** and use your AD
username and password. You see **Administration**.

## 5. Structure, people and roles (Administration)

1. **Organization**: add the groups, then the teams (one per AD team group).
2. **Directory**: choose the EPI team for each AD group → **Preview import** → read every change →
   apply. People are created or linked by e-mail; nobody is deactivated; roles are never imported.
3. **People**: give each team lead the role "Team lead" on their team, each group manager "Group
   manager" on their group (and "Engineering manager" / "HR partner" where needed), and set grades
   (Junior / Mid / Senior / Tech Lead). Groups of fewer than 3 people show no totals.

## 6. Jira and GitLab

On the server (input is hidden; the tokens stay in `.epi/sources/`):

```bash
./epi.sh source-token EPI_JIRA_TOKEN
./epi.sh source-token EPI_GITLAB_TOKEN
./epi.sh source-ca /path/to/corp-ca.pem && ./epi.sh stop && ./epi.sh start   # only for an internal CA
```

In **Administration › Settings › Add a connection**: Jira (URL, project keys) and GitLab (URL,
project IDs). Each shows "Token found on the server"; use **Test connection** (it reports version,
access and what it can read). Then **Integrations › Sync now** for each; the first run reads the
last 6 months. Optional checks from the server:

```bash
./epi.sh cli jira-check --name <name>
./epi.sh cli gitlab-check --name <name>
```

## 7. Map and check

- **Identities**: link each unmapped Jira/GitLab account to a person (bots stay unmapped).
- **Statuses**: confirm To Do / In progress / Review / QA / Blocked / Done for every Jira status.
- **Data quality**: unmapped accounts, missing links, last sync, retention; resolve or note each item.
- **Integrations › Daily sync**: choose the time and turn it on (a scheduled job: your decision).

## 8. Reconcile before anyone relies on the numbers

Pick **20 Jira issues** and **10 merge requests** across the pilot teams and, for each, compare
EPI's drill-down ("How calculated?" → items behind the value) with Jira/GitLab:

| Check | Pass when |
|---|---|
| Issue start/done times | Match the first In-progress and the Done transition in Jira history |
| Cycle Time of the issue | Done − start, in days, as in the worked example |
| Aging of open issues | Now − start, open issues only |
| MR first review request and first review | Match GitLab's reviewer request and first reviewer note/approval |
| Review Waiting Time | First review − request, per reviewer request |
| Bots and the author's own notes | Excluded |
| A person in two teams over time | Counted in the team of that date |

Record mismatches (issue key / MR number, expected, shown) without personal data and send them for
a fix before UAT. Then: backup (`./epi.sh backup`; Keycloak's database is not in it yet), UAT the
week of 2026-10-26, pilot 2026-11-02.

## Operating

`./epi.sh status`, `logs`, `stop`/`start`, `backup`, `restore <file>`, `upgrade <bundle>` (backs up,
migrates, rolls back automatically), `source-token <REF> --remove`. Changing the team groups, addresses or the
bind account after the first start: edit `.epi/sso.conf` (and the password/CA files), then `./epi.sh sso-apply`.

## Verified by

`scripts/test-offline-install.sh` (bundle, offline install, no egress, tokens, company CA, host
list) · `scripts/e2e-sso-ldap.sh` (sso-setup, directory-check, setup-admin, AD sign-in) ·
`scripts/test-upgrade.sh` · `scripts/e2e-admin.sh` (Settings, Directory, Identities, Statuses,
Integrations in the browser) · `scripts/ci.sh` (unit, integration, web, scripts).
