import { deriveWorkTimes } from '../../kpi/engine/flow';
import type { StatusCategory } from '../../kpi/engine/types';
import type { JiraField, JiraIssue } from './jira.types';

export interface JiraMappingContext {
  storyPointsField: string | null;
  /** Admin-confirmed or inferred category for a Jira status ID; null = unmapped. */
  categoryForStatus: (statusId: string | null, statusName: string | null) => StatusCategory | null;
}

export interface MappedWorkItem {
  externalKey: string;
  projectKey: string;
  issueType: string;
  workType: string;
  assigneeExternalId: string | null;
  storyPoints: number | null;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  doneAt: Date | null;
  updatedAt: Date;
}

export interface MappedEvent {
  externalEventId: string;
  fieldName: 'status';
  oldValue: string | null;
  newValue: string | null;
  statusCategory: StatusCategory | null;
  eventAt: Date;
}

export interface MappedIssue {
  item: MappedWorkItem;
  events: MappedEvent[];
  /** Status names in the history that have no category mapping (data-quality signal). */
  unknownStatuses: string[];
}

/** Jira DC timestamps look like 2026-08-01T09:00:00.000+0300 (offset without colon). */
export function parseJiraDate(value: string): Date {
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid Jira date: ${value}`);
  return d;
}

export function workTypeFor(issueTypeName: string): string {
  const n = issueTypeName.trim().toLowerCase();
  if (n === 'bug' || n === 'defect') return 'bug';
  if (n === 'story' || n === 'user story') return 'story';
  if (n === 'task' || n === 'sub-task' || n === 'subtask') return 'task';
  return 'other';
}

/** Default mapping from Jira's built-in status categories, used until an admin refines it. */
export function categoryForJiraStatusCategory(key: string | undefined): StatusCategory | null {
  switch (key) {
    case 'new':
      return 'TODO';
    case 'indeterminate':
      return 'IN_PROGRESS';
    case 'done':
      return 'DONE';
    default:
      return null;
  }
}

/** Story Points field is never hardcoded (spec §7): discover, and only auto-pick when unambiguous. */
export function discoverStoryPointsField(fields: JiraField[]): {
  fieldId: string | null;
  candidates: string[];
} {
  const candidates = fields
    .filter(
      (f) =>
        f.custom &&
        /^story ?points?( estimate)?$/i.test(f.name.trim()) &&
        (f.schema?.type === 'number' || /:float$/.test(f.schema?.custom ?? '')),
    )
    .map((f) => f.id);
  return { fieldId: candidates.length === 1 ? candidates[0] : null, candidates };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Maps one issue (with its COMPLETE changelog) to a work item and status events. Only metadata
 * is read: no summary, description, comments or attachments.
 */
export function mapIssue(issue: JiraIssue, ctx: JiraMappingContext): MappedIssue {
  const cl = issue.changelog;
  if (cl && cl.total > cl.histories.length) {
    throw new Error(`truncated changelog for ${issue.key}`);
  }
  const f = issue.fields;
  const createdAt = parseJiraDate(f.created);
  const statusChanges = (cl?.histories ?? [])
    .flatMap((h) =>
      h.items
        .filter((i) => i.field === 'status')
        .map((i) => ({ id: h.id, at: parseJiraDate(h.created), i })),
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const unknown = new Set<string>();
  const category = (id: string | null, name: string | null) => {
    const c = ctx.categoryForStatus(id, name);
    if (!c && name) unknown.add(name);
    return c;
  };

  // Jira has no "created" changelog entry; the initial status is the first transition's source.
  const first = statusChanges[0]?.i;
  const initialId = first ? first.from : f.status.id;
  const initialName = first ? first.fromString : f.status.name;
  const events: MappedEvent[] = [
    {
      externalEventId: 'created',
      fieldName: 'status',
      oldValue: null,
      newValue: initialName,
      statusCategory: category(initialId, initialName),
      eventAt: createdAt,
    },
    ...statusChanges.map(({ id, at, i }) => ({
      externalEventId: id,
      fieldName: 'status' as const,
      oldValue: i.fromString,
      newValue: i.toString,
      statusCategory: category(i.to, i.toString),
      eventAt: at,
    })),
  ];

  const times = deriveWorkTimes({
    key: issue.key,
    workType: '',
    complexity: 'UNKNOWN',
    transitions: events
      .filter((e) => e.statusCategory !== null)
      .map((e) => ({ at: e.eventAt, to: e.statusCategory as StatusCategory })),
  });

  return {
    item: {
      externalKey: issue.key,
      projectKey: f.project.key,
      issueType: f.issuetype.name,
      workType: workTypeFor(f.issuetype.name),
      assigneeExternalId: f.assignee ? (f.assignee.key ?? f.assignee.name ?? null) : null,
      storyPoints: ctx.storyPointsField ? numberOrNull(f[ctx.storyPointsField]) : null,
      status: f.status.name,
      createdAt,
      startedAt: times.startedAt,
      doneAt: times.doneAt,
      updatedAt: parseJiraDate(f.updated),
    },
    events,
    unknownStatuses: [...unknown],
  };
}
