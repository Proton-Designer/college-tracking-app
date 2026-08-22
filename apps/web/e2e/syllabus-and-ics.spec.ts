import path from "node:path";
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./fixtures/test-user";
import { supabaseAdmin } from "./fixtures/supabase-admin";

// E4/Path B: syllabus upload and Brightspace ICS confirmation. Both ultimately call a
// real Edge Function (syllabus-extract, brightspace-confirm) that isn't served in this
// local environment (no Edge Runtime container) -- so what these tests can actually
// prove is that the UI never hangs, never fabricates a result, and surfaces whatever
// real error comes back honestly. They cannot prove a successful extraction/confirm
// round trip; that needs a live Edge Runtime and, for extraction, a real
// ANTHROPIC_API_KEY -- see docs/E0_ONBOARDING_SPEC.md and the L12A backend commit for
// why that gap is real and documented, not hidden.
test.describe("Syllabus upload never hangs or fabricates a result", () => {
  test("uploading a real file surfaces a real outcome, not an infinite spinner", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "syllabus-upload" });

    try {
      const { data: course, error } = await supabaseAdmin
        .from("courses")
        .insert({ user_id: user.id, code: "BME 301", name: "Biomedical Instrumentation", term: "Fall 2026" })
        .select("id")
        .single();
      expect(error).toBeNull();

      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      await page.goto(`/courses/${course!.id}`);
      await page.getByRole("button", { name: "Upload syllabus" }).click();

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(path.join(__dirname, "fixtures", "sample-syllabus.pdf"));
      await page.getByRole("button", { name: "Upload & extract" }).click();

      // Whatever happens (extraction unreachable, staged items, or "found nothing"),
      // the modal must resolve to a real, visible outcome within a few seconds -- never
      // stay in a perpetual loading state. The upload itself succeeds (Storage is real
      // and local); only extraction fails, so the modal stays on its idle/error step and
      // deliberately keeps "Upload & extract" visible to allow a retry -- it is the error
      // text, not the button's disappearance, that proves this resolved to a real outcome.
      const dialog = page.locator('[role="dialog"]');
      // The one thing we can assert precisely in this environment: extraction cannot
      // succeed (no Edge Runtime serving locally), so this must be the honest failure
      // path, explicitly pointing back to manual entry -- never silent, never fabricated.
      await expect(dialog.getByText(/couldn't run|manually|try again/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

test.describe("Pending Brightspace deadlines in Settings never silently disappear or crash on decision", () => {
  test("a staged ICS event renders with a real confirm/reject action", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "ics-pending" });

    try {
      // No real Brightspace feed exists in this environment -- stage a pending
      // extraction directly, the same shape syncBrightspaceFeed would have produced,
      // so the SETTINGS UI (not the sync itself) is what's under test here.
      const { data: feedId, error: feedError } = await supabaseAdmin.rpc("store_brightspace_feed_url", {
        p_user_id: user.id,
        p_ics_url: "https://example.edu/feed.ics",
      });
      expect(feedError).toBeNull();

      const { error: eventError } = await supabaseAdmin.from("ics_event_extractions").insert({
        user_id: user.id,
        feed_id: feedId,
        external_id: "e2e-fixture-event-1@brightspace",
        summary: "BME 301 Exam 2",
        start_at: "2026-12-10T18:00:00Z",
        is_all_day: false,
        status: "pending",
      });
      expect(eventError).toBeNull();

      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      await page.goto("/settings");
      await expect(page.getByText("Pending Brightspace deadlines")).toBeVisible();
      await expect(page.getByText("BME 301 Exam 2")).toBeVisible();

      // Deciding on it must never hang or throw an unhandled error -- the edge function
      // isn't reachable in this environment, so this proves the failure path is
      // graceful (a toast, not a crash), not that confirmation succeeds. The toast
      // auto-dismisses after 4s (ToastProvider.AUTO_DISMISS_MS), so poll promptly.
      await page.getByRole("button", { name: "Confirm" }).click();
      await expect(page.getByText(/couldn't save that decision|added to your calendar/i)).toBeVisible({ timeout: 3_000 });
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
