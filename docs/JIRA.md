# Jira Data Center connection (read-only)

EPI reads **metadata only** from Jira: issue key, project, issue type, current status, assignee ID, created/updated times, Story Points (if confirmed) and the **status change history**. It does not read summaries, descriptions, comments or attachments, and never writes to Jira.

## 1. What the Jira admin provides

| Item | Notes |
|---|---|
| Base URL (`https://jira.internal.example`) and exact version | `jira-check` prints the version it sees |
| Service account with a **personal access token** (Jira DC 8.14+) | Browse Projects on the pilot projects only; **no** create/edit/admin rights |
| Pilot project keys | e.g. `ENG,OPS` |
| Status workflow → category list | EPI infers To Do / In Progress / Done from Jira's status categories; an EPI admin refines Blocked / Review / QA |
| Story Points field | Auto-discovered; confirm if several candidates exist |
| Internal CA certificate | If Jira uses an internal CA: `NODE_EXTRA_CA_CERTS` |

Put the token in a root-only file (e.g. `/etc/epi/jira_token`, `chmod 600`) and expose it as `EPI_JIRA_TOKEN_FILE`. **Never paste it into chat, tickets or Git.** EPI stores only the reference name `EPI_JIRA_TOKEN`.

## 2. Configure and verify

```bash
node dist/cli.js jira-add --name jira-main --url https://jira.internal.example --projects ENG,OPS
EPI_JIRA_TOKEN_FILE=/etc/epi/jira_token node dist/cli.js jira-check --name jira-main
#  Jira 9.12.0 (Server): reachable, token accepted
#    statuses visible: 14 · Story Points field: customfield_10002 · issues in backfill window: 812
EPI_JIRA_TOKEN_FILE=/etc/epi/jira_token node dist/cli.js jira-sync --name jira-main   # first run = 6-month backfill
```

(Inside the container: `docker compose exec epi node dist/cli.js …`.) Admins can also use the API: `GET /api/v1/admin/integrations`, `POST /api/v1/admin/sync`, `GET /api/v1/admin/sync-runs`, `GET|PUT /api/v1/admin/status-mappings…`.

## 3. Map people and statuses

- **People:** add `external_identities(source='jira', external_id=<Jira user key, e.g. JIRAUSER10100>)` for each pilot member (admin screen: EPI-008). Unmapped assignees are counted in each run (`unmappedAssignees`) and their items are not attributed to anyone.
- **Statuses:** review `GET /api/v1/admin/status-mappings`; set e.g. "Code Review" → `REVIEW`, "Blocked" → `BLOCKED` with `PUT /api/v1/admin/status-mappings/jira-main/<statusId>`. Admin choices are never overwritten; the next sync re-categorizes history.

## Daily automatic sync

Administration › Integrations › **Daily sync** (or `GET|PUT /api/v1/admin/sync-schedule`) runs every enabled Jira and GitLab connection once a day at a local hour in an IANA time zone (off by default). Runs go one after another; a connection already syncing is skipped; a failure never stops the others or advances that connection's cursor. Each daily run is audited (`sync.scheduled`, counts only). If EPI was down at the hour it catches up later the same day; DST gaps/repeats run exactly once. With several EPI processes on one database only one claims each day. `EPI_SYNC_SCHEDULER=off` disables the in-process scheduler (e.g. when an external cron calls `jira-sync`/`gitlab-sync`); it also stops the daily retention job (run `retention` from cron then).

## How sync works

- JQL: `project in (…) AND issuetype not in ("Epic") AND updated >= "-Nm" ORDER BY updated, key` — relative minutes, so the service account's time zone does not matter.
- Window: first run = backfill (`backfillMonths`, default 6); later runs = since last success minus `overlapHours` (default 48).
- Paging (Jira DC caps at 50 per page), bounded retries with backoff and `Retry-After`, 30 s timeouts; 401/403 fail immediately.
- Truncated changelogs are re-read per issue; an issue whose history still can't be read completely is skipped and counted (`skippedIssues`), never stored partially.
- Upserts are idempotent; a second identical run changes nothing. The cursor advances only after a fully successful run. Only one run per connection at a time.

## Known limitations

- Attribution uses the **current assignee** at sync time, not who worked on each status.
- Issues deleted or moved out of the configured projects in Jira are not removed from EPI yet (reconciliation job planned).
- Sprint data (commitments) is not collected yet (Phase 2, KPI-05).

**In the UI:** Administration › Settings adds or changes connections (address, projects, token secret name, on/off) and has *Test connection*; the token itself stays a file on the server (`<NAME>_FILE`). With `EPI_SOURCE_HOSTS` set, only listed hosts are accepted (ADR-033).
