/**
 * Stable internal error vocabulary. UI code (web + mobile) matches on `code`, never on
 * `message` or a raw Supabase error shape -- provider error text/codes can change across
 * supabase-js versions, and matching on it would silently break message rendering.
 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'session_missing'
  | 'network_error'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  /** Safe to show a user as-is. Never the raw provider message. */
  message: string;
}

export type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthError };

export function authOk<T>(data: T): AuthResult<T> {
  return { ok: true, data };
}

export function authErr(error: AuthError): AuthResult<never> {
  return { ok: false, error };
}
