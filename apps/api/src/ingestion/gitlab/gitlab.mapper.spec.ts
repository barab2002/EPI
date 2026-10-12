import { findIssueKey, isBotUser, mapMergeRequest, parseReviewRequest } from './gitlab.mapper';
import type { GitLabMergeRequest, GitLabNote } from './gitlab.types';

const author = { id: 1, username: 'dana' };
const alice = { id: 2, username: 'alice' };
const bob = { id: 3, username: 'bob' };
const ciBot = { id: 9, username: 'project_42_bot', bot: true };

function mr(over: Partial<GitLabMergeRequest> = {}): GitLabMergeRequest {
  return {
    id: 500,
    iid: 7,
    project_id: 42,
    title: 'Improve retries',
    description: null,
    source_branch: 'feature/ENG-12-retries',
    state: 'merged',
    created_at: '2026-08-10T08:00:00.000Z',
    updated_at: '2026-08-11T10:00:00.000Z',
    merged_at: '2026-08-11T09:00:00.000Z',
    author,
    reviewers: [alice],
    ...over,
  };
}
const note = (
  id: number,
  a: GitLabNote['author'],
  at: string,
  body: string,
  system = false,
): GitLabNote => ({
  id,
  author: a,
  created_at: at,
  body,
  system,
});

describe('parseReviewRequest', () => {
  it.each([
    ['requested review from @alice', ['alice']],
    ['requested review from @alice and @bob', ['alice', 'bob']],
    ['requested review from @a.b, @c-d, and @e_f', ['a.b', 'c-d', 'e_f']],
  ])('%s', (body, expected) => expect(parseReviewRequest(body)).toEqual(expected));
  it.each([['removed review request for @alice'], ['assigned to @alice'], ['requested changes']])(
    'ignores %s',
    (body) => expect(parseReviewRequest(body)).toBeNull(),
  );
});

describe('isBotUser', () => {
  it.each([
    [ciBot, true],
    [{ id: 1, username: 'renovate-bot' }, true],
    [{ id: 1, username: 'group_7_bot_abc' }, true],
    [{ id: 1, username: 'ghost' }, true],
    [{ id: 1, username: 'dependabot' }, true],
    [{ id: 1, username: 'abbott' }, false],
    [{ id: 1, username: 'robert' }, false],
  ])('%p -> %s', (u, expected) => expect(isBotUser(u, [])).toBe(expected));
  it('honors configured bot usernames', () => {
    expect(isBotUser({ id: 1, username: 'sonar' }, ['sonar'])).toBe(true);
  });
});

describe('findIssueKey', () => {
  const pattern = '\\b([A-Z][A-Z0-9_]+-\\d+)\\b';
  it('prefers the branch, then title, then description', () => {
    expect(findIssueKey(mr(), pattern)).toEqual({ key: 'ENG-12', source: 'branch' });
    expect(findIssueKey(mr({ source_branch: 'fix', title: 'OPS-3: x' }), pattern)).toEqual({
      key: 'OPS-3',
      source: 'title',
    });
    expect(
      findIssueKey(mr({ source_branch: 'fix', title: 'x', description: 'Closes ENG-9' }), pattern),
    ).toEqual({ key: 'ENG-9', source: 'description' });
    expect(findIssueKey(mr({ source_branch: 'fix', title: 'x' }), pattern)).toBeNull();
  });
  it('handles lowercase branch keys', () => {
    expect(findIssueKey(mr({ source_branch: 'eng-44-thing' }), pattern)).toEqual({
      key: 'ENG-44',
      source: 'branch',
    });
  });
});

describe('mapMergeRequest', () => {
  const notes: GitLabNote[] = [
    note(1, author, '2026-08-10T08:00:05.000Z', 'requested review from @alice and @bob', true),
    note(2, ciBot, '2026-08-10T08:10:00.000Z', 'Pipeline passed'),
    note(3, author, '2026-08-10T08:30:00.000Z', 'Self-note: ready'),
    note(4, author, '2026-08-10T09:00:00.000Z', 'added 1 commit', true),
    note(5, alice, '2026-08-10T12:00:00.000Z', 'Looks good, one nit'),
    note(6, bob, '2026-08-10T14:00:00.000Z', 'approved this merge request', true),
  ];
  const m = mapMergeRequest(mr(), notes, {
    botUsernames: [],
    issueKeyPattern: '\\b([A-Z][A-Z0-9_]+-\\d+)\\b',
  });

  it('maps MR metadata and the linked issue key without storing text', () => {
    expect(m.mr).toMatchObject({
      projectExternalId: '42',
      iid: '7',
      authorExternalId: '1',
      state: 'merged',
      linkedIssueKey: 'ENG-12',
      linkSource: 'branch',
    });
    expect(m.mr.createdAt.toISOString()).toBe('2026-08-10T08:00:00.000Z');
    expect(JSON.stringify(m)).not.toContain('Looks good');
    expect(JSON.stringify(m)).not.toContain('Improve retries');
  });

  it('emits one review_requested event per requested reviewer, resolved to user IDs', () => {
    expect(m.events.filter((e) => e.type === 'review_requested')).toEqual([
      expect.objectContaining({ externalEventId: '1:alice', actorExternalId: '2' }),
      expect.objectContaining({ externalEventId: '1:bob', actorExternalId: '3' }),
    ]);
  });

  it('keeps human notes and approvals, flags bots, drops other system notes', () => {
    const rest = m.events.filter((e) => e.type !== 'review_requested');
    expect(rest.map((e) => [e.externalEventId, e.type, e.actorExternalId, e.isBot])).toEqual([
      ['2', 'note', '9', true],
      ['3', 'note', '1', false],
      ['5', 'note', '2', false],
      ['6', 'approval', '3', false],
    ]);
  });

  it('keeps an unresolvable requested reviewer as a username reference', () => {
    const r = mapMergeRequest(
      mr({ reviewers: [] }),
      [note(1, author, '2026-08-10T08:00:05.000Z', 'requested review from @zed', true)],
      { botUsernames: [], issueKeyPattern: '\\b([A-Z][A-Z0-9_]+-\\d+)\\b' },
    );
    expect(r.events[0]).toMatchObject({ actorExternalId: 'username:zed' });
  });
});
