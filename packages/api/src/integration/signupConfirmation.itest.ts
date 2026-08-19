import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signUp } from '../auth/auth';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';

// Proves the REAL signup -> email pipeline: a real signUp() call against the running
// local GoTrue auth server, with enable_confirmations = true (supabase/config.toml),
// actually produces a confirmation email that lands in Mailpit -- not mocked, not assumed.

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

const testEmail = `itest-signup-${Date.now()}@collegeos.test`;

async function findMailpitMessageTo(email: string, attempts = 10): Promise<{ Subject: string } | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const body = (await res.json()) as { messages: Array<{ Subject: string }> };
    if (body.messages.length > 0) return body.messages[0]!;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

describe('real signup -> confirmation email in Mailpit', () => {
  let client: ReturnType<typeof createClient<Database>>;

  beforeAll(() => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
  });

  it('sends a real confirmation email that a real client can retrieve from Mailpit', async () => {
    const result = await signUp(client, { email: testEmail, password: 'itest-password-123' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.needsEmailConfirmation).toBe(true);
    }

    const message = await findMailpitMessageTo(testEmail);
    expect(message).not.toBeNull();
    expect(message?.Subject.toLowerCase()).toMatch(/confirm/);
  });
});
