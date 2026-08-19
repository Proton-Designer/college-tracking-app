import { isAuthApiError, type AuthError as SupabaseAuthError } from '@supabase/supabase-js';
import type { AuthError, AuthErrorCode } from './types';

/**
 * Maps a Supabase auth-js error to our stable internal vocabulary using `error.code`
 * (the machine-readable code auth-js has provided since 2.x — see
 * @supabase/auth-js's ErrorCode union), never `error.message`, which is provider prose
 * that can change wording across versions without warning.
 *
 * `invalid_credentials` deliberately covers both "no such user" and "wrong password" —
 * see mapSignInError, which forces every sign-in failure through this single code so the
 * response can never be used to enumerate registered emails.
 */
// @barrel-internal -- used only by auth/auth.ts's own call sites, never called directly by a consumer.
export function mapSupabaseAuthError(error: unknown): AuthError {
  if (!isAuthApiError(error)) {
    return { code: 'network_error', message: 'Could not reach the server. Check your connection and try again.' };
  }

  const code: AuthErrorCode = (() => {
    switch (error.code) {
      case 'invalid_credentials':
        return 'invalid_credentials';
      case 'email_not_confirmed':
        return 'email_not_confirmed';
      case 'weak_password':
        return 'weak_password';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
      case 'over_sms_send_rate_limit':
        return 'rate_limited';
      case 'session_not_found':
      case 'session_expired':
      case 'refresh_token_not_found':
      case 'refresh_token_already_used':
        return 'session_missing';
      default:
        return 'unknown';
    }
  })();

  return { code, message: messageFor(code) };
}

function messageFor(code: AuthErrorCode): string {
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password combination doesn’t match our records.';
    case 'email_not_confirmed':
      return 'Please confirm your email before signing in.';
    case 'weak_password':
      return 'That password is too weak. Use at least 10 characters.';
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'session_missing':
      return 'Your session has expired. Please sign in again.';
    case 'network_error':
      return 'Could not reach the server. Check your connection and try again.';
    case 'unknown':
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Sign-in and password-reset failures must never let a caller distinguish "no account
 * with that email" from "wrong password" -- that distinction is an account-enumeration
 * oracle. Every failure on those two flows is forced to `invalid_credentials`'s message,
 * regardless of what Supabase actually reported.
 */
// @barrel-internal -- used only by auth/auth.ts's own call sites, never called directly by a consumer.
export function mapEnumerationSafeError(error: unknown): AuthError {
  const mapped = mapSupabaseAuthError(error);
  // Rate limiting and network errors are legitimate to surface distinctly -- they don't
  // reveal anything about which accounts exist. Everything else collapses to the same
  // generic "invalid credentials" response.
  if (mapped.code === 'rate_limited' || mapped.code === 'network_error') {
    return mapped;
  }
  return { code: 'invalid_credentials', message: messageFor('invalid_credentials') };
}

export type { SupabaseAuthError };
