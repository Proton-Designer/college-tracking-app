import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./fixtures/test-user";

// E0's acceptance test, built up incrementally as each manual-path piece lands: create a
// brand-new account and, without touching psql or the seed, reach a Today screen with a
// real course, a real deliverable, and a real task on it (docs/E0_ONBOARDING_SPEC.md).
// Currently covers the course step; deliverable and task steps are added as those land.
test.describe("E0 manual path: a brand-new account can add a real course with no help from psql", () => {
  test("empty /courses offers a working Add course action, and the course a user adds actually persists", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "onboarding" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      await page.goto("/courses");
      await expect(page.getByText("No courses yet")).toBeVisible();

      // The empty state must offer a working action, not just name one (E0's core
      // complaint: "No courses yet. Add one..." with neither action present).
      await page.getByRole("button", { name: "Add course" }).click();
      await page.getByLabel("Code").fill("BME 301");
      await page.getByLabel("Name").fill("Biomedical Instrumentation");
      await page.getByLabel("Term").fill("Fall 2026");
      await page.getByRole("button", { name: "Add course", exact: true }).last().click();

      // Submitting navigates straight to the new course's detail page.
      await page.waitForURL(/\/courses\/\d+$/, { timeout: 10_000 });
      await expect(page.getByTestId("course-detail-code")).toHaveText("BME 301");

      await page.goto("/courses");
      await expect(page.getByText("No courses yet")).not.toBeVisible();
      await expect(page.getByText("BME 301")).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
