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

  test("E2/E1: a course can be edited, given a weight category, a grade boundary, and a real assignment", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "onboarding-course-detail" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      await page.goto("/courses");
      await page.getByRole("button", { name: "Add course" }).click();
      await page.getByLabel("Code").fill("CS 180");
      await page.getByLabel("Name").fill("Problem Solving");
      await page.getByLabel("Term").fill("Fall 2026");
      await page.getByRole("button", { name: "Add course", exact: true }).last().click();
      await page.waitForURL(/\/courses\/\d+$/, { timeout: 10_000 });

      // Edit course.
      await page.getByRole("button", { name: "Edit course" }).click();
      await page.getByLabel("Target grade (%)").fill("90");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("90", { exact: true })).toBeVisible();

      // Add a weight category.
      await page.getByRole("button", { name: "Add category" }).click();
      await page.getByLabel("Name").fill("Homework");
      await page.getByLabel("Weight (%)").fill("60");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Homework").first()).toBeVisible();
      await expect(page.getByText("60%", { exact: false }).first()).toBeVisible();

      // Add a grade boundary.
      await page.getByRole("button", { name: "+ Add boundary" }).click();
      await page.getByLabel("Letter").fill("A");
      await page.getByLabel("Minimum percent").fill("93");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("A 93%+")).toBeVisible();

      // Add a real assignment with a real due date.
      await page.getByRole("button", { name: "Add assignment" }).click();
      await page.getByLabel("Title").fill("Homework 1");
      await page.getByLabel("Type").selectOption("problem_set");
      await page.getByLabel("Due date").fill("2026-12-01");
      await page.getByRole("button", { name: "Add assignment", exact: true }).last().click();
      await expect(page.getByText("Homework 1")).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("E5/U3: /deliverables/[id] generates a real backplan and configures a real task's proof-of-work requirement", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "onboarding-deliverable-detail" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      await page.goto("/courses");
      await page.getByRole("button", { name: "Add course" }).click();
      await page.getByLabel("Code").fill("PHYS 241");
      await page.getByLabel("Name").fill("Modern Physics");
      await page.getByLabel("Term").fill("Fall 2026");
      await page.getByRole("button", { name: "Add course", exact: true }).last().click();
      await page.waitForURL(/\/courses\/\d+$/, { timeout: 10_000 });

      await page.getByRole("button", { name: "Add assignment" }).click();
      await page.getByLabel("Title").fill("Exam 2");
      await page.getByLabel("Type").selectOption("exam");
      await page.getByLabel("Due date").fill("2026-12-10");
      await page.getByLabel("Estimated minutes (optional)").fill("120");
      await page.getByRole("button", { name: "Add assignment", exact: true }).last().click();

      await page.getByRole("link", { name: "Exam 2" }).click();
      await page.waitForURL(/\/deliverables\/\d+$/, { timeout: 10_000 });
      await expect(page.getByTestId("deliverable-detail-title")).toHaveText("Exam 2");

      // Backplan: none yet, generate a real one.
      await expect(page.getByText("No backplan generated yet.")).toBeVisible();
      await page.getByRole("button", { name: "Generate backplan" }).click();
      await expect(page.getByText("No backplan generated yet.")).not.toBeVisible();

      // Add a real task under this assignment.
      await page.getByRole("button", { name: "Add task" }).click();
      await page.getByLabel("Title").fill("Retrieval practice block");
      await page.getByLabel("Category").fill("exam_prep");
      await page.getByLabel("Planned date").fill("2026-12-08");
      await page.getByRole("button", { name: "Add task", exact: true }).last().click();
      await expect(page.getByText("Retrieval practice block")).toBeVisible();

      // Configure that task's proof-of-work requirement.
      await page.getByLabel("Requires proof of work").click();
      await page.getByLabel("Proof type…").selectOption("summary_text");
      await page.waitForTimeout(500); // debounced-by-network save, no explicit submit button
      await page.reload();
      const toggle = page.getByLabel("Requires proof of work");
      await expect(toggle).toBeChecked();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("E0 acceptance: a brand-new account reaches a Today screen with a real course, deliverable, and task on it", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "onboarding-acceptance" });

    try {
      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      // The gate: a zero-course account must not see the daily ritual at all.
      await expect(page.getByText("Start with a course")).toBeVisible();
      await expect(page.getByText("Top 3")).not.toBeVisible();
      await expect(page.getByText("How much of today will you actually finish?")).not.toBeVisible();

      // Path A, step 1: add a course, right from Today's own gate.
      await page.getByRole("button", { name: "Add course" }).click();
      await page.getByLabel("Code").fill("CHEM 255");
      await page.getByLabel("Name").fill("Organic Chemistry");
      await page.getByLabel("Term").fill("Fall 2026");
      await page.getByRole("button", { name: "Add course", exact: true }).last().click();
      await page.waitForURL(/\/courses\/\d+$/, { timeout: 10_000 });

      // Path A, step 2: add what's due.
      await page.getByRole("button", { name: "Add assignment" }).click();
      await page.getByLabel("Title").fill("Lab Report 3");
      await page.getByLabel("Type").selectOption("report");
      await page.getByLabel("Due date").fill("2026-12-05");
      await page.getByRole("button", { name: "Add assignment", exact: true }).last().click();
      await expect(page.getByText("Lab Report 3")).toBeVisible();

      // Step 3: land on Today, with something real to reason about.
      await page.goto("/today");
      await expect(page.getByText("Start with a course")).not.toBeVisible();

      // The gate is gone, but the morning check-in itself still takes over the top of
      // the screen until submitted or skipped (existing, correct Today behavior) --
      // skip it to reach the rest of the page.
      await page.getByRole("button", { name: "Skip for today" }).click();

      // A real task, added right from Today's own quick-add.
      await page.getByRole("button", { name: "+ Add task" }).click();
      await page.getByLabel("Title").fill("Draft lab report intro");
      await page.getByLabel("Category").fill("writing");
      await page.getByRole("combobox", { name: "Course" }).selectOption("CHEM 255");
      await page.getByRole("button", { name: "Add task", exact: true }).last().click();

      // The acceptance bar: a real course, a real deliverable, and a real task, all
      // reachable from Today, with none of it touching psql or the seed.
      await expect(page.getByText("Nothing set up yet")).not.toBeVisible();
      await expect(page.getByText("Draft lab report intro").first()).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
