import { DirectoryGroup, DirectoryPerson } from './directory.client';
import { EpiState, planHash, planImport } from './import-plan';

const person = (id: string, name: string, email: string | null = null): DirectoryPerson => ({
  externalId: id,
  username: name.toLowerCase().replace(/ /g, '.'),
  email,
  displayName: name,
});
const group = (
  dn: string,
  members: DirectoryPerson[],
  name: string | null = dn,
): DirectoryGroup => ({
  dn,
  name,
  members,
});

const PAY = 'cn=payments,ou=groups';
const WEB = 'cn=web,ou=groups';
const OTHER = 'cn=unmapped,ou=groups';

function state(over: Partial<EpiState> = {}): EpiState {
  return {
    mappings: { [PAY]: 't-pay', [WEB]: 't-web' },
    teams: { 't-pay': 'Payments', 't-web': 'Web', 't-manual': 'Manual' },
    people: [],
    memberships: [],
    ...over,
  };
}

describe('planImport', () => {
  it('creates new people with their team; unmapped and missing groups only warn', () => {
    const plan = planImport(
      [
        group(PAY, [person('g-1', 'Ada Lane', 'ada@corp.example')]),
        group(OTHER, [person('g-9', 'Zed Other')]),
        group('cn=gone,ou=groups', [], null),
      ],
      state({ mappings: { [PAY]: 't-pay', [OTHER]: null } }),
    );
    expect(plan.creates).toEqual([
      { externalId: 'g-1', displayName: 'Ada Lane', email: 'ada@corp.example', teamId: 't-pay' },
    ]);
    expect(plan.warnings).toEqual([
      'Group cn=gone,ou=groups was not found in the directory.',
      'Group cn=unmapped,ou=groups is not mapped to a team; its 1 member(s) are not imported.',
    ]);
    expect(plan.adds).toEqual([]);
    expect(plan.ends).toEqual([]);
  });

  it('links an existing EPI person by e-mail (case-insensitive) instead of creating a duplicate', () => {
    const plan = planImport(
      [group(PAY, [person('g-1', 'Ada Lane', 'ada@corp.example')])],
      state({
        people: [
          {
            id: 'u-1',
            displayName: 'Ada L.',
            email: 'ADA@corp.example',
            active: true,
            directoryId: null,
          },
        ],
      }),
    );
    expect(plan.creates).toEqual([]);
    expect(plan.links).toEqual([{ userId: 'u-1', externalId: 'g-1', displayName: 'Ada Lane' }]);
    expect(plan.updates).toEqual([
      {
        userId: 'u-1',
        from: { displayName: 'Ada L.', email: 'ada@corp.example' },
        to: { displayName: 'Ada Lane', email: 'ada@corp.example' },
      },
    ]);
    expect(plan.adds).toEqual([
      { userId: 'u-1', displayName: 'Ada Lane', teamId: 't-pay', endMembershipIds: [] },
    ]);
  });

  it('is a no-op when EPI already matches the directory (idempotent)', () => {
    const plan = planImport(
      [group(PAY, [person('g-1', 'Ada Lane', 'ada@corp.example')])],
      state({
        people: [
          {
            id: 'u-1',
            displayName: 'Ada Lane',
            email: 'ada@corp.example',
            active: true,
            directoryId: 'g-1',
          },
        ],
        memberships: [{ id: 'm-1', userId: 'u-1', teamId: 't-pay' }],
      }),
    );
    expect(plan.total).toBe(0);
  });

  it('transfers between mapped teams, but never touches manually managed teams', () => {
    const plan = planImport(
      [group(PAY, []), group(WEB, [person('g-1', 'Ada Lane')])],
      state({
        people: [
          { id: 'u-1', displayName: 'Ada Lane', email: null, active: true, directoryId: 'g-1' },
        ],
        memberships: [
          { id: 'm-pay', userId: 'u-1', teamId: 't-pay' },
          { id: 'm-man', userId: 'u-1', teamId: 't-manual' },
        ],
      }),
    );
    expect(plan.adds).toEqual([
      { userId: 'u-1', displayName: 'Ada Lane', teamId: 't-web', endMembershipIds: ['m-pay'] },
    ]);
    // The Payments membership ends as part of the transfer, not twice.
    expect(plan.ends).toEqual([]);
  });

  it('ends memberships in mapped teams of people no longer in the group', () => {
    const plan = planImport(
      [group(PAY, [])],
      state({
        people: [
          { id: 'u-1', displayName: 'Ada Lane', email: null, active: true, directoryId: 'g-1' },
          { id: 'u-2', displayName: 'Bo Manual', email: null, active: true, directoryId: null },
        ],
        memberships: [
          { id: 'm-1', userId: 'u-1', teamId: 't-pay' },
          { id: 'm-2', userId: 'u-2', teamId: 't-pay' },
          { id: 'm-3', userId: 'u-2', teamId: 't-manual' },
        ],
      }),
    );
    expect(plan.ends).toEqual([
      { membershipId: 'm-1', userId: 'u-1', displayName: 'Ada Lane', teamId: 't-pay' },
      { membershipId: 'm-2', userId: 'u-2', displayName: 'Bo Manual', teamId: 't-pay' },
    ]);
  });

  it('does not end memberships of a mapped team whose group could not be read', () => {
    const plan = planImport(
      [group(PAY, [], null)],
      state({
        people: [
          { id: 'u-1', displayName: 'Ada Lane', email: null, active: true, directoryId: 'g-1' },
        ],
        memberships: [{ id: 'm-1', userId: 'u-1', teamId: 't-pay' }],
      }),
    );
    expect(plan.ends).toEqual([]);
  });

  it('reports conflicts and skips those people', () => {
    const plan = planImport(
      [
        group(PAY, [
          person('g-1', 'Two Teams'),
          person('g-2', 'Shared Mail', 'dup@corp.example'),
          person('g-3', 'Inactive One', 'old@corp.example'),
          person('g-4', 'Taken Mail', 'taken@corp.example'),
        ]),
        group(WEB, [person('g-1', 'Two Teams')]),
      ],
      state({
        people: [
          {
            id: 'u-a',
            displayName: 'A',
            email: 'dup@corp.example',
            active: true,
            directoryId: null,
          },
          {
            id: 'u-b',
            displayName: 'B',
            email: 'dup@corp.example',
            active: true,
            directoryId: null,
          },
          {
            id: 'u-c',
            displayName: 'Inactive One',
            email: null,
            active: false,
            directoryId: 'g-3',
          },
          {
            id: 'u-d',
            displayName: 'D',
            email: 'taken@corp.example',
            active: true,
            directoryId: 'g-other',
          },
        ],
      }),
    );
    expect(plan.conflicts).toEqual([
      {
        externalId: 'g-1',
        displayName: 'Two Teams',
        reason: 'In groups of 2 teams (Payments, Web); add them to one team only.',
      },
      {
        externalId: 'g-2',
        displayName: 'Shared Mail',
        reason: 'Several EPI people have the e-mail dup@corp.example.',
      },
      {
        externalId: 'g-3',
        displayName: 'Inactive One',
        reason: 'Deactivated in EPI; reactivate them under People first.',
      },
      {
        externalId: 'g-4',
        displayName: 'Taken Mail',
        reason: 'The EPI person with taken@corp.example is linked to another directory account.',
      },
    ]);
    expect(plan.creates).toEqual([]);
    expect(plan.adds).toEqual([]);
  });

  it('two groups mapped to the same team are fine', () => {
    const plan = planImport(
      [group(PAY, [person('g-1', 'Ada Lane')]), group(WEB, [person('g-1', 'Ada Lane')])],
      state({ mappings: { [PAY]: 't-pay', [WEB]: 't-pay' } }),
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.creates).toHaveLength(1);
  });
});

describe('planHash', () => {
  it('is stable for equal plans and changes with the plan', () => {
    const a = planImport([group(PAY, [person('g-1', 'Ada Lane')])], state());
    const b = planImport([group(PAY, [person('g-1', 'Ada Lane')])], state());
    const c = planImport([group(PAY, [person('g-2', 'Bo')])], state());
    expect(planHash(a)).toBe(planHash(b));
    expect(planHash(a)).not.toBe(planHash(c));
    expect(planHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
