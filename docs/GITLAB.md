# GitLab self-managed connection (read-only)

EPI reads **merge request metadata and review activity** from GitLab: project ID, MR IID, author, created/merged times, state, reviewer requests, who commented or approved and when. It does **not** store MR titles, descriptions, note text, diffs or code, and never writes to GitLab. Note text is read only to recognize reviewer-request and approval system notes.

## 1. What the GitLab admin provides

| Item | Notes |
|---|---|
| Base URL and exact version/edition (e.g. 18.2.1-ee) | `gitlab-check` prints what it sees |
| Token with **`read_api`** only (personal, group or project access token, Reporter role on pilot projects) | no `api`/write scopes |
| Numeric project IDs of the pilot repositories | Settings → General |
| Bot/service account usernames (CI, Renovate, Sonar…) | GitLab bot accounts and `*-bot` names are detected automatically |
| Branch naming / Jira key convention | default pattern finds keys like `ENG-123` in branch, title or description |
| Internal CA certificate | `./epi.sh source-ca <ca.pem>` (sets `NODE_EXTRA_CA_CERTS`) |

On the server, run `./epi.sh source-token EPI_GITLAB_TOKEN` and paste the token when asked (input hidden); it is stored in `.epi/sources/` and read by the running app. **Never paste it into chat, tickets or Git.** (Outside Docker, `EPI_GITLAB_TOKEN_FILE` still works and takes precedence.)

## 2. Configure and verify

```bash
node dist/cli.js gitlab-add --name gitlab-main --url https://gitlab.internal.example --projects 42,57 --bots sonar,ci-runner
EPI_GITLAB_TOKEN_FILE=/etc/epi/gitlab_token node dist/cli.js gitlab-check --name gitlab-main
#  GitLab 18.2.1-ee: reachable, token accepted
#    project 42 (platform/payments): 37 MRs updated in 30 days
EPI_GITLAB_TOKEN_FILE=/etc/epi/gitlab_token node dist/cli.js gitlab-sync --name gitlab-main   # first run = 6-month backfill
```

Admins can also start syncs via `POST /api/v1/admin/sync {"connection":"gitlab-main"}` and watch `GET /api/v1/admin/sync-runs`.

## 3. Map people

Add `external_identities(source='gitlab', external_id=<numeric GitLab user ID>)` for each pilot member (admin screen: EPI-008). Each run reports `unmappedUsers` (bots excluded). MRs are attributed to a team through the **author's** team membership at MR creation; reviewer requests count even if the reviewer is not mapped yet.

## What is measured

- **Review Waiting Time** (KPI-03, preferred): per reviewer request (from GitLab's "requested review from @…" system notes), hours until that reviewer's first human note or approval. Bot notes, author self-notes and other system notes never count.
- **MR Open → First Review** (separate proxy KPI) is used only when a source exposes no reviewer-request events.
- **Jira links**: first key found in branch (case-insensitive), then title, then description; linked only if that Jira issue exists in EPI. The source is stored as `link_confidence` (`branch` > `title` > `description`); manual override arrives with EPI-008.

## Daily automatic sync

Same schedule as Jira — see `JIRA.md` › Daily automatic sync.

## How sync works

`updated_after` (UTC ISO timestamps) with 48 h overlap after the first backfill, `X-Next-Page` pagination for MRs and notes, bounded retries/backoff with `Retry-After`, fail-fast on 401/403, inaccessible projects reported by ID, idempotent upserts, cursor only on success, one run per connection.

## Known limitations

- Reviewer requests before GitLab 13.8 (no system note) are not visible; such MRs fall back to the proxy KPI.
- Removed reviewer requests ("removed review request for @x") are not yet subtracted.
- Page-number pagination; keyset pagination for very large projects (>10k MRs per window) is a later optimization.
- MRs deleted in GitLab are not removed from EPI yet.

**In the UI:** Administration › Settings adds or changes connections (address, projects, token secret name, on/off) and has *Test connection*; the token itself stays a file on the server (`<NAME>_FILE`). With `EPI_SOURCE_HOSTS` set, only listed hosts are accepted (ADR-033).
