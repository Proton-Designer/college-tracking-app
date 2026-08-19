import { test, expect } from "@playwright/test";

// Runs with the storageState produced by auth.setup.ts (see playwright.config.ts's
// "authenticated" project) — already signed in, no login step here.
//
// .serial: both tests restore the SAME on-disk session snapshot into independent browser
// contexts. Supabase rotates the refresh token on use (enable_refresh_token_rotation); two
// contexts refreshing the identical token concurrently can race and invalidate each other's
// session. Running them one at a time avoids that — a real constraint of testing against
// rotating refresh tokens, not a flaky test.
test.describe.serial("Session persistence", () => {
  test("a signed-in session survives a hard reload and stays off auth routes", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByTestId("today-user-email")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("today-user-email")).toBeVisible();

    // Authenticated users get bounced off auth routes, not shown the form.
    await page.goto("/login");
    await page.waitForURL(/\/today$/);
  });

  test("signing out clears the session and protected routes redirect again", async ({ page }) => {
    await page.goto("/today");
    await page.getByTestId("sign-out").click();

    await page.waitForURL(/\/login$/);
    await page.goto("/today");
    await page.waitForURL(/\/login\?next=%2Ftoday/);
  });
});
