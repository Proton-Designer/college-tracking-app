import { test as base } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./test-user";

/**
 * Extends the base Playwright test with a `testUser` fixture: a fresh, isolated Supabase user
 * created before the test and deleted after, regardless of pass/fail. Specs that need a signed-in
 * user should depend on this instead of creating users ad hoc, so isolation is never accidental.
 */
export const test = base.extend<{ testUser: TestUser }>({
  testUser: async ({}, use) => {
    const user = await createTestUser();
    try {
      await use(user);
    } finally {
      await deleteTestUser(user.id);
    }
  },
});

export { expect } from "@playwright/test";
