import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./fixtures/test-user";
import { supabaseAdmin } from "./fixtures/supabase-admin";

// Regression coverage for the 500 the Lead found live on the demo account: EVERY real
// course 500'd (computeRiskAssessment fetched all of a user's open deliverables
// unscoped by course, but course detail only ever hands it the one course it's viewing
// -- see packages/api/src/day/risk.ts and its risk.itest.ts). Only /courses/999 (a
// nonexistent course) rendered correctly, which is precisely backwards: the only
// working page was the one with no data.
//
// The bug needed >=1 OTHER course with an open deliverable to exist -- a fixture with a
// single course, or a test that only ever visits "the first course," would not have
// caught it. This loops over every course the fixture creates rather than hardcoding
// one id, per that exact lesson.
test.describe("Course detail renders for every course, not just the first", () => {
  test("a user with multiple courses, each holding an open deliverable, can open every one of them", async ({ page }) => {
    const user = await createTestUser({ emailPrefix: "course-detail" });

    try {
      const { data: courses, error: coursesError } = await supabaseAdmin
        .from("courses")
        .insert([
          { user_id: user.id, code: "BME 301", name: "Biomedical Instrumentation", term: "Fall 2026" },
          { user_id: user.id, code: "CS 180", name: "Problem Solving", term: "Fall 2026" },
        ])
        .select("id, code");
      expect(coursesError).toBeNull();
      expect(courses).toHaveLength(2);

      const { error: deliverablesError } = await supabaseAdmin.from("deliverables").insert(
        courses!.map((c, i) => ({
          user_id: user.id,
          course_id: c.id,
          title: `${c.code} assignment`,
          type: "problem_set" as const,
          due_at: `2026-11-1${i}T18:00:00Z`,
          local_due_date: "1970-01-01", // overwritten by the sync trigger
        })),
      );
      expect(deliverablesError).toBeNull();

      await page.goto("/login");
      await page.getByTestId("email-input").fill(user.email);
      await page.getByTestId("password-input").fill(user.password);
      await page.getByTestId("login-submit").click();
      await page.waitForURL(/\/today$/, { timeout: 10_000 });

      for (const course of courses!) {
        const response = await page.goto(`/courses/${course.id}`);
        expect(response?.status(), `GET /courses/${course.id} (${course.code})`).toBe(200);
        await expect(page.getByTestId("course-detail-code")).toHaveText(course.code);
      }

      // A course that doesn't exist still degrades to the in-app "couldn't load" state,
      // not a 500 -- confirms the fix didn't accidentally widen what counts as "found."
      const missing = await page.goto("/courses/999999999");
      expect(missing?.status()).toBe(200);
      await expect(page.getByText("Couldn't load this course")).toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
