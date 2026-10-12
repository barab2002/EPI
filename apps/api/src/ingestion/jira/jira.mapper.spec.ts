import {
  categoryForJiraStatusCategory,
  discoverStoryPointsField,
  JiraMappingContext,
  mapIssue,
  parseJiraDate,
  workTypeFor,
} from './jira.mapper';
import type { StatusCategory } from '../../kpi/engine/types';
import type { JiraIssue } from './jira.types';

const ctx: JiraMappingContext = {
  storyPointsField: 'customfield_10002',
  // status id -> category (admin overrides: 10010 = "In Review" -> REVIEW)
  categoryForStatus: (id) =>
    (
      ({ '1': 'TODO', '3': 'IN_PROGRESS', '10010': 'REVIEW', '6': 'DONE' }) as Record<
        string,
        StatusCategory
      >
    )[id ?? ''] ?? null,
};

function issue(
  overrides: Partial<JiraIssue['fields']> = {},
  histories: JiraIssue['changelog'] = undefined,
): JiraIssue {
  return {
    id: '10001',
    key: 'ENG-1',
    fields: {
      issuetype: { name: 'Story' },
      status: { id: '6', name: 'Done', statusCategory: { key: 'done' } },
      assignee: { key: 'JIRAUSER10100', name: 'dana', displayName: 'Dana Dev' },
      project: { key: 'ENG' },
      created: '2026-08-01T09:00:00.000+0300',
      updated: '2026-08-06T12:00:00.000+0300',
      customfield_10002: 5,
      ...overrides,
    },
    changelog: histories ?? {
      startAt: 0,
      maxResults: 100,
      total: 3,
      histories: [
        {
          id: '200',
          created: '2026-08-02T10:00:00.000+0300',
          items: [
            {
              field: 'status',
              fieldtype: 'jira',
              from: '1',
              fromString: 'Open',
              to: '3',
              toString: 'In Progress',
            },
            {
              field: 'assignee',
              fieldtype: 'jira',
              from: null,
              fromString: null,
              to: 'dana',
              toString: 'Dana Dev',
            },
          ],
        },
        {
          id: '201',
          created: '2026-08-04T10:00:00.000+0300',
          items: [
            {
              field: 'status',
              from: '3',
              fromString: 'In Progress',
              to: '10010',
              toString: 'In Review',
            },
          ],
        },
        {
          id: '202',
          created: '2026-08-06T10:00:00.000+0300',
          items: [
            { field: 'status', from: '10010', fromString: 'In Review', to: '6', toString: 'Done' },
          ],
        },
      ],
    },
  };
}

describe('parseJiraDate', () => {
  it('parses Jira DC offsets without a colon', () => {
    expect(parseJiraDate('2026-08-01T09:00:00.000+0300').toISOString()).toBe(
      '2026-08-01T06:00:00.000Z',
    );
    expect(parseJiraDate('2026-08-01T09:00:00.000-0530').toISOString()).toBe(
      '2026-08-01T14:30:00.000Z',
    );
  });
  it('rejects invalid dates instead of producing NaN', () => {
    expect(() => parseJiraDate('not a date')).toThrow('Invalid Jira date');
  });
});

describe('mapIssue', () => {
  it('maps metadata and status history, deriving start/done from the changelog', () => {
    const m = mapIssue(issue(), ctx);
    expect(m.item).toMatchObject({
      externalKey: 'ENG-1',
      projectKey: 'ENG',
      issueType: 'Story',
      workType: 'story',
      storyPoints: 5,
      status: 'Done',
      assigneeExternalId: 'JIRAUSER10100',
    });
    expect(m.item.startedAt?.toISOString()).toBe('2026-08-02T07:00:00.000Z');
    expect(m.item.doneAt?.toISOString()).toBe('2026-08-06T07:00:00.000Z');
    expect(m.events.map((e) => [e.externalEventId, e.newValue, e.statusCategory])).toEqual([
      ['created', 'Open', 'TODO'],
      ['200', 'In Progress', 'IN_PROGRESS'],
      ['201', 'In Review', 'REVIEW'],
      ['202', 'Done', 'DONE'],
    ]);
  });

  it('ignores non-status changelog items and stores no summary/description', () => {
    const m = mapIssue(issue({ summary: 'Secret project codename', description: 'x' }), ctx);
    expect(m.events.every((e) => e.fieldName === 'status')).toBe(true);
    expect(JSON.stringify(m)).not.toContain('Secret project codename');
  });

  it('uses the current status as the creation status when there is no history', () => {
    const m = mapIssue(
      issue(
        { status: { id: '3', name: 'In Progress' } },
        { startAt: 0, maxResults: 100, total: 0, histories: [] },
      ),
      ctx,
    );
    expect(m.events).toEqual([
      expect.objectContaining({
        externalEventId: 'created',
        newValue: 'In Progress',
        statusCategory: 'IN_PROGRESS',
      }),
    ]);
    expect(m.item.startedAt?.toISOString()).toBe('2026-08-01T06:00:00.000Z');
    expect(m.item.doneAt).toBeNull();
  });

  it('reports unmapped statuses instead of guessing', () => {
    const m = mapIssue(
      issue(
        {},
        {
          startAt: 0,
          maxResults: 100,
          total: 1,
          histories: [
            {
              id: '300',
              created: '2026-08-02T10:00:00.000+0000',
              items: [
                { field: 'status', from: '1', fromString: 'Open', to: '999', toString: 'Mystery' },
              ],
            },
          ],
        },
      ),
      ctx,
    );
    expect(m.unknownStatuses).toEqual(['Mystery']);
    expect(m.events.find((e) => e.externalEventId === '300')?.statusCategory).toBeNull();
  });

  it('handles unassigned issues and missing story points', () => {
    const m = mapIssue(issue({ assignee: null, customfield_10002: null }), ctx);
    expect(m.item.assigneeExternalId).toBeNull();
    expect(m.item.storyPoints).toBeNull();
  });

  it('throws if the changelog is truncated (caller must fetch the full history)', () => {
    expect(() =>
      mapIssue(issue({}, { startAt: 0, maxResults: 1, total: 3, histories: [] }), ctx),
    ).toThrow('truncated changelog');
  });
});

describe('workTypeFor', () => {
  it.each([
    ['Bug', 'bug'],
    ['Story', 'story'],
    ['Task', 'task'],
    ['Sub-task', 'task'],
    ['Spike', 'other'],
  ])('%s -> %s', (name, expected) => expect(workTypeFor(name)).toBe(expected));
});

describe('categoryForJiraStatusCategory (default before admin mapping)', () => {
  it.each([
    ['new', 'TODO'],
    ['indeterminate', 'IN_PROGRESS'],
    ['done', 'DONE'],
    ['undefined', null],
  ])('%s -> %s', (key, expected) => expect(categoryForJiraStatusCategory(key)).toBe(expected));
});

describe('discoverStoryPointsField', () => {
  it('returns the single numeric "Story Points" custom field', () => {
    expect(
      discoverStoryPointsField([
        { id: 'summary', name: 'Summary', custom: false },
        {
          id: 'customfield_10002',
          name: 'Story Points',
          custom: true,
          schema: {
            type: 'number',
            custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
          },
        },
      ]),
    ).toEqual({ fieldId: 'customfield_10002', candidates: ['customfield_10002'] });
  });
  it('does not pick one when ambiguous', () => {
    const f = (id: string, name: string) => ({
      id,
      name,
      custom: true,
      schema: { type: 'number' },
    });
    expect(
      discoverStoryPointsField([
        f('customfield_1', 'Story Points'),
        f('customfield_2', 'Story point estimate'),
      ]),
    ).toEqual({
      fieldId: null,
      candidates: ['customfield_1', 'customfield_2'],
    });
  });
});
