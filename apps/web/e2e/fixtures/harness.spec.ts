import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./test-user";
import { supabaseAdmin } from "./supabase-admin";
import { waitForMessageTo, getMessageBody, extractFirstLink } from "./mailpit";

/**
 * Proves the harness pieces themselves work against the real local stack — not just that the app
 * skeleton renders. These don't touch the app UI at all.
 */
test.describe("e2e harness", () => {
  test("test-user factory creates and deletes a real, isolated Supabase user", async () => {
    const user = await createTestUser({ emailPrefix: "harness" });

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(user.id);
    expect(error).toBeNull();
    expect(data.user?.email).toBe(user.email);
    expect(data.user?.email_confirmed_at).toBeTruthy();

    await deleteTestUser(user.id);

    const { data: afterDelete } = await supabaseAdmin.auth.admin.getUserById(user.id);
    expect(afterDelete.user).toBeNull();
  });

  test("Mailpit fixture reads a real password-reset email sent by local Supabase", async () => {
    // Local Supabase runs with `enable_confirmations = false` (supabase/config.toml), so a plain
    // signUp() auto-confirms and sends nothing — that's the setting L3's signup flow will need to
    // flip to exercise the real confirmation email. resetPasswordForEmail always sends locally
    // regardless of that setting, so it's what proves the Mailpit fixture works today.
    const user = await createTestUser({ emailPrefix: "mailpit" });

    try {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email);
      expect(error).toBeNull();

      const message = await waitForMessageTo(user.email);
      const body = await getMessageBody(message.ID);
      const link = extractFirstLink(body.Text || body.HTML);

      expect(link).toContain("http");
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
