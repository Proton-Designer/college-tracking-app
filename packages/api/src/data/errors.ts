import type { PostgrestError } from '@supabase/supabase-js';
import type { DataError, DataErrorCode } from './types';
import { REST_TIMEOUT_SENTINEL_READ, REST_TIMEOUT_SENTINEL_WRITE } from '../client/timeoutFetch';

/**
 * Maps a PostgREST/Postgres error to our stable internal vocabulary using the Postgres
 * SQLSTATE (`error.code`), never `error.message` (raw constraint names / server text
 * that leaks schema detail and can change across migrations).
 *
 * The timeout branch below is not an exception to that rule: `error.code === ''` is
 * postgrest-js's own marker for "this never reached Postgres at all" (a caught fetch
 * exception, never a real SQLSTATE — see PostgrestBuilder's own error construction), and
 * the sentinel text it's paired with here is ours end-to-end (createTimeoutFetch writes it,
 * this function reads it back), never text the server produced. Still not `error.message`
 * in the sense the comment above warns against.
 */
// @barrel-internal -- used only by data/ and day/ modules' own call sites, never called directly by a consumer.
export function mapDataError(error: PostgrestError): DataError {
  if (error.code === '' && typeof error.message === 'string') {
    if (error.message.includes(REST_TIMEOUT_SENTINEL_WRITE)) return { code: 'timeout_write', message: messageFor('timeout_write') };
    if (error.message.includes(REST_TIMEOUT_SENTINEL_READ)) return { code: 'timeout_read', message: messageFor('timeout_read') };
  }

  const code: DataErrorCode = (() => {
    switch (error.code) {
      case 'PGRST116': // .single()/.maybeSingle() found no matching row
        return 'not_found';
      case '23505': // unique_violation
        return 'conflict';
      case '23503': // foreign_key_violation
      case '23502': // not_null_violation
      case '23514': // check_violation
        return 'validation';
      default:
        return 'unknown';
    }
  })();

  return { code, message: messageFor(code) };
}

/**
 * P2's ratified copy rule: a timed-out READ may honestly report failure (nothing happened,
 * there's no side effect to be uncertain about). A timed-out WRITE may only report
 * uncertainty -- the request may already have landed server-side by the time the client
 * gave up waiting, so asserting "failed" would invite a duplicate submit on data that
 * already saved. Never auto-retry a mutation on timeout for the same reason.
 */
function messageFor(code: DataErrorCode): string {
  switch (code) {
    case 'not_found':
      return 'That record could not be found.';
    case 'conflict':
      return 'That already exists.';
    case 'validation':
      return 'That data is not valid.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    case 'timeout_read':
      return "Couldn't reach the server in time. Check your connection and try again.";
    case 'timeout_write':
      return "Couldn't confirm this saved — check before trying again.";
    case 'unknown':
      return 'Something went wrong. Please try again.';
  }
}
