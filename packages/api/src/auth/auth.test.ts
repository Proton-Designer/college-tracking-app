import { describe, expect, it, vi } from 'vitest';
import { getSession, onAuthStateChange, resetPassword, signIn, signOut, signUp, updatePassword } from './auth';
import type { TypedSupabaseClient } from '../client/types';

function fakeAuthApiError(code: string, message = code) {
  return { name: 'AuthApiError', message, status: 400, code, __isAuthError: true };
}

function fakeClient(auth: Partial<TypedSupabaseClient['auth']>): TypedSupabaseClient {
  return { auth } as unknown as TypedSupabaseClient;
}

describe('signUp', () => {
  it('reports needsEmailConfirmation for a brand-new signup with confirmations on', async () => {
    const client = fakeClient({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [{ id: 'x' }] }, session: null },
        error: null,
      }),
    });
    const result = await signUp(client, { email: 'new@test.local', password: 'longenoughpw' });
    expect(result).toEqual({ ok: true, data: { needsEmailConfirmation: true } });
  });

  it('masks an already-registered email as needsEmailConfirmation instead of erroring', async () => {
    // Supabase's own anti-enumeration behavior: empty identities array, no error.
    const client = fakeClient({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [] }, session: null },
        error: null,
      }),
    });
    const result = await signUp(client, { email: 'already-registered@test.local', password: 'longenoughpw' });
    expect(result).toEqual({ ok: true, data: { needsEmailConfirmation: true } });
  });

  it('maps a real signUp error through the standard (non-enumeration-safe) mapper', async () => {
    const client = fakeClient({
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: fakeAuthApiError('weak_password') }),
    });
    const result = await signUp(client, { email: 'x@test.local', password: '123' });
    expect(result).toEqual({ ok: false, error: { code: 'weak_password', message: expect.any(String) } });
  });
});

describe('signIn — enumeration safety', () => {
  it('returns the generic invalid_credentials code for a nonexistent account', async () => {
    const client = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: fakeAuthApiError('invalid_credentials') }),
    });
    const result = await signIn(client, { email: 'nobody@test.local', password: 'whatever12' });
    expect(result).toEqual({ ok: false, error: { code: 'invalid_credentials', message: expect.any(String) } });
  });

  it('returns the SAME generic code for a real account with the wrong password', async () => {
    // Supabase itself reports the same 'invalid_credentials' code for both cases, but
    // this test locks in that our mapping never introduces a distinguishing code even if
    // that changes.
    const client = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: fakeAuthApiError('invalid_credentials') }),
    });
    const result = await signIn(client, { email: 'real-user@test.local', password: 'wrongpassword' });
    expect(result).toEqual({ ok: false, error: { code: 'invalid_credentials', message: expect.any(String) } });
  });

  it('does not mask a rate-limit failure -- that is safe to surface distinctly', async () => {
    const client = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: fakeAuthApiError('over_request_rate_limit') }),
    });
    const result = await signIn(client, { email: 'x@test.local', password: 'y' });
    expect(result).toEqual({ ok: false, error: { code: 'rate_limited', message: expect.any(String) } });
  });

  it('returns the session on success', async () => {
    const session = { access_token: 'tok', user: { id: 'u1' } };
    const client = fakeClient({
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    });
    const result = await signIn(client, { email: 'x@test.local', password: 'y' });
    expect(result).toEqual({ ok: true, data: { session } });
  });
});

describe('resetPassword — enumeration safety', () => {
  it('reports success even when Supabase reports invalid_credentials-equivalent for an unknown email', async () => {
    const client = fakeClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: fakeAuthApiError('user_not_found') }),
    });
    const result = await resetPassword(client, 'nobody@test.local', 'https://app.example/reset');
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('reports success for a known email', async () => {
    const client = fakeClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    });
    const result = await resetPassword(client, 'real@test.local', 'https://app.example/reset');
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('still surfaces a genuine rate-limit failure', async () => {
    const client = fakeClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: fakeAuthApiError('over_email_send_rate_limit') }),
    });
    const result = await resetPassword(client, 'x@test.local', 'https://app.example/reset');
    expect(result).toEqual({ ok: false, error: { code: 'rate_limited', message: expect.any(String) } });
  });
});

describe('updatePassword / signOut / getSession', () => {
  it('updatePassword maps a same_password error to unknown (not enumeration-masked)', async () => {
    const client = fakeClient({
      updateUser: vi.fn().mockResolvedValue({ error: fakeAuthApiError('same_password') }),
    });
    const result = await updatePassword(client, 'newpassword123');
    expect(result.ok).toBe(false);
  });

  it('signOut returns ok on success', async () => {
    const client = fakeClient({ signOut: vi.fn().mockResolvedValue({ error: null }) });
    expect(await signOut(client)).toEqual({ ok: true, data: undefined });
  });

  it('getSession returns the current session, including null when signed out', async () => {
    const client = fakeClient({ getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) });
    expect(await getSession(client)).toEqual({ ok: true, data: null });
  });
});

describe('onAuthStateChange', () => {
  it('wires the callback through and returns the subscription', () => {
    const subscription = { id: 'sub1', unsubscribe: vi.fn() };
    const onAuthStateChangeMock = vi.fn().mockReturnValue({ data: { subscription } });
    const client = fakeClient({ onAuthStateChange: onAuthStateChangeMock });

    const callback = vi.fn();
    const returned = onAuthStateChange(client, callback);

    expect(onAuthStateChangeMock).toHaveBeenCalledWith(callback);
    expect(returned).toBe(subscription);
  });
});
