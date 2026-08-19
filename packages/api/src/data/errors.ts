import type { PostgrestError } from '@supabase/supabase-js';
import type { DataError, DataErrorCode } from './types';

/**
 * Maps a PostgREST/Postgres error to our stable internal vocabulary using the Postgres
 * SQLSTATE (`error.code`), never `error.message` (raw constraint names / server text
 * that leaks schema detail and can change across migrations).
 */
export function mapDataError(error: PostgrestError): DataError {
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
    case 'unknown':
      return 'Something went wrong. Please try again.';
  }
}
