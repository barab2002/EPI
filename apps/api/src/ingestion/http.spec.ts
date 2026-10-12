import { backoffDelayMs, fetchJson, HttpError, RetryPolicy } from './http';

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000, timeoutMs: 1000 };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('backoffDelayMs', () => {
  it('grows exponentially and is capped', () => {
    const noJitter = () => 0.5; // jitter factor 1.0
    expect(backoffDelayMs(1, policy, undefined, noJitter)).toBe(100);
    expect(backoffDelayMs(2, policy, undefined, noJitter)).toBe(200);
    expect(backoffDelayMs(3, policy, undefined, noJitter)).toBe(400);
    expect(backoffDelayMs(10, policy, undefined, noJitter)).toBe(1000);
  });
  it('honors Retry-After seconds but never beyond the cap', () => {
    expect(backoffDelayMs(1, policy, '0.5')).toBe(500);
    expect(backoffDelayMs(1, policy, '3600')).toBe(1000);
  });
});

describe('fetchJson', () => {
  const sleep = jest.fn(async () => undefined);
  beforeEach(() => sleep.mockClear());

  it('retries 429 and 5xx, then succeeds', async () => {
    const f = jest
      .fn()
      .mockResolvedValueOnce(json(429, {}, { 'retry-after': '0' }))
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const r = await fetchJson<{ ok: boolean }>('http://x/a', {}, { policy, fetchImpl: f, sleep });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('retries network errors', async () => {
    const f = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, 1));
    expect(await fetchJson('http://x/a', {}, { policy, fetchImpl: f, sleep })).toBe(1);
  });

  it('reports the system cause of network failures', async () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const f = jest.fn().mockRejectedValue(err);
    await expect(fetchJson('http://x/a', {}, { policy, fetchImpl: f, sleep })).rejects.toThrow(
      'http://x/a: network error (ENOTFOUND)',
    );
  });

  it('gives up after maxAttempts with the last status', async () => {
    const f = jest.fn().mockResolvedValue(json(500, {}));
    await expect(
      fetchJson('http://x/a', {}, { policy, fetchImpl: f, sleep }),
    ).rejects.toMatchObject({
      status: 500,
    });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('fails fast on 4xx other than 429 (e.g. bad credentials)', async () => {
    const f = jest.fn().mockResolvedValue(json(401, { message: 'nope' }));
    const err = (await fetchJson('http://x/a', {}, { policy, fetchImpl: f, sleep }).catch(
      (e: unknown) => e,
    )) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(401);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('never puts credentials into error messages', async () => {
    const f = jest.fn().mockResolvedValue(json(403, {}));
    const err = (await fetchJson(
      'http://x/rest/api/2/search?jql=a',
      { headers: { Authorization: 'Bearer super-secret-token' } },
      { policy, fetchImpl: f, sleep },
    ).catch((e: unknown) => e)) as Error;
    expect(err.message).not.toContain('super-secret-token');
    expect(err.message).toContain('/rest/api/2/search');
  });
});
