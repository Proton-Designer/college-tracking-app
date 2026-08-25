import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from './types';

/**
 * Invokes one edge function and surfaces the REAL error message on failure.
 *
 * functions.invoke returns a generic FunctionsHttpError ("Edge Function returned a
 * non-2xx status code") for any 4xx/5xx, discarding the response body -- which is where
 * this repo's functions put their precise, actionable reasons (apiErr envelopes like
 * `"Quiz 4" has no resolved date... Edit the diff...`). Found live 2026-08-25: a 422
 * whose body named exactly what to fix reached the user as an opaque non-2xx. The body
 * is recoverable from error.context (the underlying Response); this helper reads it, so
 * every caller gets the server's own words.
 */
// @barrel-internal -- plumbing for sibling data modules; callers use the typed wrappers.
export async function invokeEdgeFunction<T>(
  client: TypedSupabaseClient,
  name: string,
  body: Record<string, unknown>,
): Promise<DataResult<T>> {
  const { data, error } = await client.functions.invoke(name, { method: 'POST', body });

  if (error) {
    // FunctionsHttpError carries the Response as `context`; relay/network errors do not.
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const parsed = (await context.json()) as { ok?: boolean; error?: string };
        if (typeof parsed?.error === 'string' && parsed.error.length > 0) {
          return dataErr({ code: 'unknown', message: parsed.error });
        }
      } catch {
        // Non-JSON body -- fall through to the generic message rather than throwing away
        // the one error we do have.
      }
    }
    return dataErr({ code: 'network_error', message: error.message ?? `${name} failed. Please try again.` });
  }

  if (data != null && typeof data === 'object' && 'ok' in data) {
    const envelope = data as { ok: boolean; data?: T; error?: string };
    if (envelope.ok) return dataOk(envelope.data as T);
    return dataErr({ code: 'unknown', message: envelope.error ?? 'Request failed.' });
  }
  return dataErr({ code: 'unknown', message: 'Malformed response from server.' });
}
