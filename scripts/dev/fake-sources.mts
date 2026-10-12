// Starts the in-process fake Jira DC and GitLab servers (SYNTHETIC data) for browser E2E and
// screenshots. Prints {"jira": url, "gitlab": url} on one line, then keeps running until killed.
// Run: node --experimental-transform-types scripts/dev/fake-sources.mts <token>
import { FakeGitLab } from '../../apps/api/test/fake-gitlab.ts';
import { FakeJira } from '../../apps/api/test/fake-jira.ts';

const token = process.argv[2];
if (!token) {
  console.error('usage: fake-sources.mts <token>');
  process.exit(64);
}
const now = new Date();
const H = 3_600_000;
const jira = new FakeJira(token, () => now);
const people = [
  ['JIRAUSER10101', 'Dana Dev'],
  ['JIRAUSER10102', 'Eli Engineer'],
  ['JIRAUSER10103', 'Contractor Casey'],
];
for (let n = 1; n <= 24; n++) {
  const [key, name] = people[n % people.length];
  jira.addIssue(`PAY-${n}`, {
    project: 'PAY',
    assignee: key,
    assigneeName: name,
    storyPoints: (n % 3) + 1,
    createdDaysAgo: 30 + n,
    transitions: [
      ['3', 20 + n * 0.5],
      ['10010', 18 + n * 0.3],
      ...(n % 5 === 0 ? [] : ([['6', 10 + (n % 7)]] as [string, number][])),
    ],
  });
}
const gl = new FakeGitLab(token);
const dana = { id: 7001, username: 'dana.dev', name: 'Dana Dev' };
const eli = { id: 7002, username: 'eli.e', name: 'Eli Engineer' };
const bot = { id: 7999, username: 'project_12_bot', bot: true };
for (let i = 1; i <= 10; i++) {
  const author = i % 2 ? dana : eli;
  const reviewer = i % 2 ? eli : dana;
  const c = new Date(now.getTime() - (3 + i) * 24 * H);
  gl.addMergeRequest(12, i, {
    author,
    createdAt: c,
    branch: `feature/pay-${i}-change`,
    reviewers: [reviewer],
  });
  gl.addNote(12, i, author, c, `requested review from @${reviewer.username}`, true);
  gl.addNote(12, i, bot, new Date(c.getTime() + 0.2 * H), 'pipeline passed');
  gl.addNote(12, i, reviewer, new Date(c.getTime() + (i % 6) * H + H), 'review comment');
}
await jira.start();
await gl.start();
console.log(JSON.stringify({ jira: jira.url, gitlab: gl.url }));
process.on('SIGTERM', async () => {
  await jira.stop();
  await gl.stop();
  process.exit(0);
});
