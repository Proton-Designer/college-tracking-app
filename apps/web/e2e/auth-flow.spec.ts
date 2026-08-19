import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./fixtures/test-user";
import { extractFirstLink, getMessageBody, waitForMessageTo } from "./fixtures/mailpit";

const PASSWORD = "Test-Password-1234!";

test.describe("Signup → confirmation → authenticated", () => {
  test("a new user can sign up, confirm via the real email, and land signed in", async ({ page }) => {
    const email = `e2e-signup-${randomUUID()}@collegeos.test`;

    await page.goto("/signup");
    await page.getByTestId("signup-email-input").fill(email);
    await page.getByTestId("signup-password-input").fill(PASSWORD);
    await page.getByTestId("signup-submit").click();

    await expect(page.getByTestId("signup-success")).toContainText(email);

    const message = await waitForMessageTo(email);
    const body = await getMessageBody(message.ID);
    const confirmationLink = extractFirstLink(body.Text || body.HTML);

    await page.goto(confirmationLink);
    await page.waitForURL(/\/today$/, { timeout: 10_000 });
    await expect(page.getByTestId("today-user-email")).toHaveText(email);

    // Cleanup: this user was created via the real signup flow, not the admin factory, so it isn't
    // auto-torn-down by a fixture.
    const { supabaseAdmin } = await import("./fixtures/supabase-admin");
    const { data } = await supabaseAdmin.auth.admin.listUsers();
    const user = data.users.find((u) => u.email === email);
    if (user) await deleteTestUser(user.id);
  });
});

test.describe("Sign in", () => {
  test("a confirmed user can sign in with the right password", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "signin" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();

      await page.waitForURL(/\/today$/, { timeout: 10_000 });
      await expect(page.getByTestId("today-user-email")).toHaveText(user.email);
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("a wrong password is rejected without revealing whether the account exists", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "wrongpass" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill("definitely-not-the-password");
      await page.getByTestId("login-submit").click();

      // Same message Atlas's backend returns for "no such account" — the UI must not have its own
      // branch that would let the two cases be told apart.
      await expect(page.getByText("doesn’t match our records")).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

test.describe("Reset password", () => {
  test("a user can reset their password via the real email and sign in with the new one", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "resetpw" });
    const newPassword = "New-Password-5678!";

    try {
      await page.goto("/forgot-password");
      await page.getByTestId("forgot-password-email-input").fill(user.email);
      await page.getByTestId("forgot-password-submit").click();
      await expect(page.getByTestId("forgot-password-success")).toContainText(user.email);

      const message = await waitForMessageTo(user.email);
      const body = await getMessageBody(message.ID);
      const resetLink = extractFirstLink(body.Text || body.HTML);

      await page.goto(resetLink);
      await expect(page.getByTestId("reset-password-input")).toBeVisible({ timeout: 10_000 });

      await page.getByTestId("reset-password-input").fill(newPassword);
      await page.getByTestId("reset-password-confirm-input").fill(newPassword);
      await page.getByTestId("reset-password-submit").click();

      await expect(page.getByTestId("reset-password-success")).toBeVisible();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      // updatePassword left the browser signed in via the recovery session — sign out first, or
      // /login just bounces straight back to /today (route protection working as intended).
      await page.getByTestId("sign-out").click();
      await page.waitForURL(/\/login$/);

      // Prove the new password is what actually works now, not just that the form submitted.
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(newPassword);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

test.describe("Route protection", () => {
  test("an unauthenticated visitor is redirected off a protected route to /login", async ({ page }) => {
    await page.goto("/today");
    await page.waitForURL(/\/login\?next=%2Ftoday/);
  });
});
