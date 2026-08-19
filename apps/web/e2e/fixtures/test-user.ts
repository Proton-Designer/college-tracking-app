import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const TEST_USER_PASSWORD = "Test-Password-1234!";

/**
 * Creates an isolated, pre-confirmed user directly against local Supabase (admin API, bypasses
 * email confirmation). Every spec that needs a signed-in user should create its own via this
 * factory and delete it in a `finally`/fixture teardown — specs must never share a user.
 */
export async function createTestUser(overrides?: { emailPrefix?: string }): Promise<TestUser> {
  const email = `e2e-${overrides?.emailPrefix ?? "user"}-${randomUUID()}@collegeos.test`;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message ?? "unknown error"}`);
  }

  return { id: data.user.id, email, password: TEST_USER_PASSWORD };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
  }
}
