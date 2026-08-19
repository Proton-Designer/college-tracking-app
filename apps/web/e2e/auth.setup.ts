import { test as setup } from "@playwright/test";
import { createTestUser } from "./fixtures/test-user";
import { STORAGE_STATE_PATH } from "./constants";

/**
 * Signs in once and saves storage state so authenticated specs can reuse the session instead of
 * logging in per test (see playwright.config.ts's `projects` comment for how to consume it).
 *
 * CONTRACT for L3's /login page — this setup targets these test ids and expects a redirect away
 * from /login on success:
 *   data-testid="email-input"
 *   data-testid="password-input"
 *   data-testid="login-submit"
 *
 * Until /login exists, this skips itself (visibly, in the Playwright report) rather than failing
 * the run or faking a session. It will activate automatically the moment the route lands.
 */
setup("authenticate", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "domcontentloaded" }).catch(() => null);
  if (!response || response.status() === 404) {
    setup.skip(true, "L3 login page (/login) not implemented yet — see the contract above.");
    return;
  }

  const user = await createTestUser({ emailPrefix: "auth-setup" });

  await page.getByTestId("email-input").fill(user.email);
  await page.getByTestId("password-input").fill(user.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
