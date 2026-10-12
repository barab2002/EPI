import { safeReturnTo } from './oidc.service';

describe('safeReturnTo (open-redirect guard)', () => {
  it.each([
    ['/teams/1', '/teams/1'],
    ['/developers/x?window=90d', '/developers/x?window=90d'],
    ['/', '/'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it.each([
    ['//evil.example'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['teams'],
    ['/ok\r\nSet-Cookie: x=1'],
    [undefined],
    [42],
    ['/' + 'a'.repeat(600)],
  ])('falls back to / for %p', (input) => {
    expect(safeReturnTo(input)).toBe('/');
  });
});
