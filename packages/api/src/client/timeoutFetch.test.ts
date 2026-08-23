import { describe, expect, it, vi } from 'vitest';
import { createTimeoutFetch, REST_TIMEOUT_SENTINEL_READ, REST_TIMEOUT_SENTINEL_WRITE } from './timeoutFetch';

/** Mirrors a real fetch's behaviour under abort: never preserves a custom `abort(reason)`
 *  value, always rejects with a generic AbortError once the signal fires -- this is
 *  deliberately the least helpful mock possible, so a passing test proves the wrapper
 *  constructs its own error rather than depending on the underlying fetch cooperating. */
function hangingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  }) as unknown as typeof fetch;
}

const OK_RESPONSE = new Response(null, { status: 200 });

describe('createTimeoutFetch', () => {
  it('passes a non-REST request straight through, untouched, even past the timeout', async () => {
    vi.useFakeTimers();
    const base = vi.fn().mockResolvedValue(OK_RESPONSE);
    const timeoutFetch = createTimeoutFetch(base, 20);

    const result = await timeoutFetch('https://project.supabase.co/auth/v1/token', { method: 'POST' });

    expect(result).toBe(OK_RESPONSE);
    expect(base).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('a REST request that resolves before the timeout returns normally', async () => {
    const base = vi.fn().mockResolvedValue(OK_RESPONSE);
    const timeoutFetch = createTimeoutFetch(base, 1000);

    const result = await timeoutFetch('https://project.supabase.co/rest/v1/tasks?select=*', { method: 'GET' });

    expect(result).toBe(OK_RESPONSE);
  });

  it('a hanging REST read times out as AbortError carrying the READ sentinel', async () => {
    vi.useFakeTimers();
    const timeoutFetch = createTimeoutFetch(hangingFetch(), 20);

    const pending = timeoutFetch('https://project.supabase.co/rest/v1/tasks?select=*', { method: 'GET' });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: REST_TIMEOUT_SENTINEL_READ });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it('a hanging REST request with no method (defaults to GET) times out with the READ sentinel', async () => {
    vi.useFakeTimers();
    const timeoutFetch = createTimeoutFetch(hangingFetch(), 20);

    const pending = timeoutFetch('https://project.supabase.co/rest/v1/tasks?select=*');
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: REST_TIMEOUT_SENTINEL_READ });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it.each(['POST', 'PATCH', 'DELETE', 'PUT'])('a hanging REST %s times out as AbortError carrying the WRITE sentinel', async (method) => {
    vi.useFakeTimers();
    const timeoutFetch = createTimeoutFetch(hangingFetch(), 20);

    const pending = timeoutFetch('https://project.supabase.co/rest/v1/tasks', { method });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: REST_TIMEOUT_SENTINEL_WRITE });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it('a HEAD request times out with the READ sentinel, not WRITE -- it has no side effect', async () => {
    vi.useFakeTimers();
    const timeoutFetch = createTimeoutFetch(hangingFetch(), 20);

    const pending = timeoutFetch('https://project.supabase.co/rest/v1/tasks', { method: 'HEAD' });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: REST_TIMEOUT_SENTINEL_READ });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it('reads the method off a Request object when no init is given -- a write must not be misread as a read', async () => {
    vi.useFakeTimers();
    const timeoutFetch = createTimeoutFetch(hangingFetch(), 20);

    const request = new Request('https://project.supabase.co/rest/v1/tasks', { method: 'POST' });
    const pending = timeoutFetch(request);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: REST_TIMEOUT_SENTINEL_WRITE });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    vi.useRealTimers();
  });

  it('an already-aborted caller signal aborts immediately rather than letting the request proceed', async () => {
    const base = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      return Promise.resolve(OK_RESPONSE);
    });
    const timeoutFetch = createTimeoutFetch(base, 10_000);
    const controller = new AbortController();
    controller.abort();

    await expect(timeoutFetch('https://project.supabase.co/rest/v1/tasks', { method: 'GET', signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('a real (non-timeout) fetch failure is never rewritten into a timeout sentinel', async () => {
    const networkError = new TypeError('Failed to fetch');
    const base = vi.fn().mockRejectedValue(networkError);
    const timeoutFetch = createTimeoutFetch(base, 1000);

    await expect(timeoutFetch('https://project.supabase.co/rest/v1/tasks', { method: 'GET' })).rejects.toBe(networkError);
  });

  it('a caller-supplied AbortSignal firing is forwarded but never mistaken for our own timeout', async () => {
    const base = hangingFetch();
    const timeoutFetch = createTimeoutFetch(base, 10_000); // long enough that only the caller's own abort can fire first
    const callerController = new AbortController();

    const pending = timeoutFetch('https://project.supabase.co/rest/v1/tasks', { method: 'POST', signal: callerController.signal });
    callerController.abort();

    // The underlying fetch's own (generic) AbortError propagates as-is -- not our sentinel,
    // since it wasn't our timer that fired.
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', message: 'The operation was aborted.' });
  });
});
