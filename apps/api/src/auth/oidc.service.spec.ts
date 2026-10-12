import { rewriteToInternal, safeReturnTo } from './oidc.service';

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

describe('rewriteToInternal (split-horizon back channel)', () => {
  const issuer = 'http://127.0.0.1:8081/realms/epi-demo';
  it('routes issuer-origin requests to the internal origin, keeping path and query', () => {
    expect(
      rewriteToInternal(
        `${issuer}/protocol/openid-connect/token?x=1`,
        issuer,
        'http://keycloak:8080',
      ),
    ).toBe('http://keycloak:8080/realms/epi-demo/protocol/openid-connect/token?x=1');
  });
  it('leaves other origins untouched', () => {
    expect(rewriteToInternal('https://other.example/a', issuer, 'http://keycloak:8080')).toBe(
      'https://other.example/a',
    );
  });
});
