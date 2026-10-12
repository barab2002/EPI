import type { GitLabMergeRequest, GitLabNote, GitLabUser } from './gitlab.types';

export const DEFAULT_ISSUE_KEY_PATTERN = '\\b([A-Z][A-Z0-9_]+-\\d+)\\b';

export interface GitLabMappingContext {
  botUsernames: string[];
  issueKeyPattern: string;
}

export type ReviewEventType = 'review_requested' | 'note' | 'approval';

export interface MappedReviewEvent {
  externalEventId: string;
  type: ReviewEventType;
  /** GitLab user ID as string, or `username:<name>` when the ID is unknown. */
  actorExternalId: string;
  isBot: boolean;
  eventAt: Date;
}

export interface MappedMergeRequest {
  mr: {
    projectExternalId: string;
    iid: string;
    authorExternalId: string;
    state: string;
    createdAt: Date;
    mergedAt: Date | null;
    updatedAt: Date;
    linkedIssueKey: string | null;
    linkSource: 'branch' | 'title' | 'description' | null;
  };
  events: MappedReviewEvent[];
  /** Accounts seen on this MR (for the admin identity-mapping screen). */
  accounts: { externalId: string; displayName: string; isBot: boolean }[];
}

const KNOWN_BOTS = /^(dependabot|renovate|renovatebot|ghost|alert-bot|support-bot|gitlab-bot)$/i;
const BOT_TOKEN = /(^|[-_.])bot($|[-_.])/i;

/** GitLab service/project/group bot accounts, well-known bots and configured names. */
export function isBotUser(user: GitLabUser, botUsernames: string[]): boolean {
  if (user.bot === true) return true;
  const u = user.username;
  return (
    botUsernames.some((b) => b.toLowerCase() === u.toLowerCase()) ||
    KNOWN_BOTS.test(u) ||
    BOT_TOKEN.test(u)
  );
}

/**
 * Parses GitLab's reviewer-request system note ("requested review from @a, @b, and @c").
 * Returns requested usernames, or null for any other note.
 */
export function parseReviewRequest(body: string): string[] | null {
  const m = /^requested review from (.+)$/.exec(body.trim());
  if (!m) return null;
  const names = [...m[1].matchAll(/@([\w.-]+)/g)].map((x) => x[1].replace(/[.]+$/, ''));
  return names.length ? names : null;
}

const isApproval = (body: string) => /^approved this merge request$/i.test(body.trim());

/** Finds a Jira-style key: branch (case-insensitive), then title, then description. */
export function findIssueKey(
  mr: Pick<GitLabMergeRequest, 'source_branch' | 'title' | 'description'>,
  pattern: string,
): { key: string; source: 'branch' | 'title' | 'description' } | null {
  const re = new RegExp(pattern);
  const candidates: [string | null, 'branch' | 'title' | 'description'][] = [
    [mr.source_branch ? mr.source_branch.toUpperCase() : null, 'branch'],
    [mr.title, 'title'],
    [mr.description, 'description'],
  ];
  for (const [text, source] of candidates) {
    const m = text ? re.exec(text) : null;
    if (m) return { key: m[1] ?? m[0], source };
  }
  return null;
}

/**
 * Maps an MR and its notes to metadata and review events. Note bodies are read only to
 * classify events (reviewer requests, approvals) and are never returned or stored.
 * Other system notes (commits pushed, labels, …) are dropped as non-substantive.
 */
export function mapMergeRequest(
  mr: GitLabMergeRequest,
  notes: GitLabNote[],
  ctx: GitLabMappingContext,
): MappedMergeRequest {
  const idByUsername = new Map<string, string>();
  for (const u of [mr.author, ...(mr.reviewers ?? []), ...notes.map((n) => n.author)]) {
    idByUsername.set(u.username.toLowerCase(), String(u.id));
  }
  const events: MappedReviewEvent[] = [];
  for (const n of [...notes].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
  )) {
    const at = new Date(n.created_at);
    if (n.system) {
      const requested = parseReviewRequest(n.body);
      if (requested) {
        for (const username of requested) {
          events.push({
            externalEventId: `${n.id}:${username}`,
            type: 'review_requested',
            actorExternalId: idByUsername.get(username.toLowerCase()) ?? `username:${username}`,
            isBot: false,
            eventAt: at,
          });
        }
      } else if (isApproval(n.body)) {
        events.push({
          externalEventId: String(n.id),
          type: 'approval',
          actorExternalId: String(n.author.id),
          isBot: isBotUser(n.author, ctx.botUsernames),
          eventAt: at,
        });
      }
      continue;
    }
    events.push({
      externalEventId: String(n.id),
      type: 'note',
      actorExternalId: String(n.author.id),
      isBot: isBotUser(n.author, ctx.botUsernames),
      eventAt: at,
    });
  }
  const link = findIssueKey(mr, ctx.issueKeyPattern);
  const accounts = new Map<string, { externalId: string; displayName: string; isBot: boolean }>();
  for (const u of [mr.author, ...(mr.reviewers ?? []), ...notes.map((n) => n.author)]) {
    accounts.set(String(u.id), {
      externalId: String(u.id),
      displayName: u.name ? `${u.name} (@${u.username})` : `@${u.username}`,
      isBot: isBotUser(u, ctx.botUsernames),
    });
  }
  return {
    mr: {
      projectExternalId: String(mr.project_id),
      iid: String(mr.iid),
      authorExternalId: String(mr.author.id),
      state: mr.state,
      createdAt: new Date(mr.created_at),
      mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
      updatedAt: new Date(mr.updated_at),
      linkedIssueKey: link?.key ?? null,
      linkSource: link?.source ?? null,
    },
    events,
    accounts: [...accounts.values()],
  };
}
