/** JSON over HTTP with bounded retries, backoff, Retry-After and timeouts. No I/O besides fetch. */

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  timeoutMs: 30_000,
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Exponential backoff with ±50% jitter; Retry-After (seconds) wins when present. Always capped. */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy,
  retryAfter?: string | null,
  random: () => number = Math.random,
): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, policy.maxDelayMs);
  const exp = policy.baseDelayMs * 2 ** (attempt - 1) * (0.5 + random());
  return Math.min(Math.round(exp), policy.maxDelayMs);
}

/** URL without query string: safe to log (queries may contain JQL but never credentials). */
function describe(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

export interface FetchDeps {
  policy?: RetryPolicy;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  deps: FetchDeps = {},
): Promise<T> {
  const policy = deps.policy ?? DEFAULT_RETRY;
  const doFetch = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: Error = new Error('no attempt made');
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: AbortSignal.timeout(policy.timeoutMs) });
    } catch (e) {
      // Surface the system cause (ENOTFOUND, ECONNREFUSED, CERT_*, timeouts); never request data.
      const cause = (e as { cause?: { code?: string } })?.cause?.code;
      const kind = cause ?? (e instanceof Error ? e.name : 'unknown');
      lastError = new HttpError(0, `${describe(url)}: network error (${kind})`);
      if (attempt < policy.maxAttempts) await sleep(backoffDelayMs(attempt, policy));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    lastError = new HttpError(res.status, `${describe(url)}: HTTP ${res.status}`);
    await res.body?.cancel().catch(() => undefined);
    if (!RETRYABLE.has(res.status)) throw lastError;
    if (attempt < policy.maxAttempts) {
      await sleep(backoffDelayMs(attempt, policy, res.headers.get('retry-after')));
    }
  }
  throw lastError;
}
