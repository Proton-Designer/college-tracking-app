import type { AuthChangeEvent, Session, Subscription } from '@supabase/supabase-js';
import type { TypedSupabaseClient } from '../client/types';
import { mapEnumerationSafeError, mapSupabaseAuthError } from './errors';
import { authErr, authOk, type AuthResult } from './types';

export interface SignUpInput {
  email: string;
  password: string;
}

/**
 * When email confirmations are on (see docs/SUPABASE_SETUP.md §5), Supabase returns a
 * user object with an EMPTY `identities` array if the email is already fully registered
 * — this is Supabase's own documented anti-enumeration mechanism for signUp, distinct
 * from the generic-error approach used for sign-in/reset below. We surface both cases
 * identically ("check your email to continue") so the caller can't tell them apart.
 */
export async function signUp(
  client: TypedSupabaseClient,
  input: SignUpInput,
): Promise<AuthResult<{ needsEmailConfirmation: boolean }>> {
  const { data, error } = await client.auth.signUp(input);
  if (error) return authErr(mapSupabaseAuthError(error));

  const alreadyRegistered = (data.user?.identities?.length ?? 0) === 0;
  return authOk({ needsEmailConfirmation: alreadyRegistered || data.session == null });
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signIn(
  client: TypedSupabaseClient,
  input: SignInInput,
): Promise<AuthResult<{ session: Session }>> {
  const { data, error } = await client.auth.signInWithPassword(input);
  // Never distinguish "no such account" from "wrong password" in the response.
  if (error || !data.session) return authErr(mapEnumerationSafeError(error));
  return authOk({ session: data.session });
}

export async function signOut(client: TypedSupabaseClient): Promise<AuthResult<void>> {
  const { error } = await client.auth.signOut();
  if (error) return authErr(mapSupabaseAuthError(error));
  return authOk(undefined);
}

/**
 * Always returns success from the caller's point of view — the response must not reveal
 * whether the email is registered. A real account gets a reset email; an unregistered
 * one gets nothing, silently. Only infrastructure failures (rate limit, network) surface.
 */
export async function resetPassword(
  client: TypedSupabaseClient,
  email: string,
  redirectTo: string,
): Promise<AuthResult<void>> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    const mapped = mapEnumerationSafeError(error);
    // resetPasswordForEmail's enumeration-safe failure IS success from the caller's
    // perspective (Supabase itself does not error for an unknown email on this call in
    // most configurations, but we defend the case where it does).
    if (mapped.code === 'invalid_credentials') return authOk(undefined);
    return authErr(mapped);
  }
  return authOk(undefined);
}

export async function updatePassword(
  client: TypedSupabaseClient,
  newPassword: string,
): Promise<AuthResult<void>> {
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) return authErr(mapSupabaseAuthError(error));
  return authOk(undefined);
}

export async function getSession(client: TypedSupabaseClient): Promise<AuthResult<Session | null>> {
  const { data, error } = await client.auth.getSession();
  if (error) return authErr(mapSupabaseAuthError(error));
  return authOk(data.session);
}

export function onAuthStateChange(
  client: TypedSupabaseClient,
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange(callback);
  return subscription;
}
