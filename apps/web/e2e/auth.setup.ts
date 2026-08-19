import { test as setup } from "@playwright/test";
import { createTestUser } from "./fixtures/test-user";
import { STORAGE_STATE_PATH } from "./constants";

/**
 * Signs in once and saves storage state so authenticated specs can reuse the session instead of
 * logging in per test (see playwright.config.ts's `projects` comment for how to consume it).
 */
setup("authenticate", async ({ page }) => {
  const user = await createTestUser({ emailPrefix: "auth-setup" });

  await page.goto("/login");
  await page.getByTestId("email-input").fill(user.email);
  await page.getByTestId("password-input").fill(user.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
