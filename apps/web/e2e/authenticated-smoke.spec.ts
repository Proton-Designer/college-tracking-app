import { test, expect, type Page } from "@playwright/test";

// B3: the Lead's route audit found ZERO e2e coverage on /courses, /calendar, /insights,
// /review, /review/[date], /settings, and /focus/[sessionId] -- seven routes that could
// each 500 exactly like B1 did and nothing would notice. B1 itself was missed by every
// existing check (verify green, 332 unit tests, 356 pgTAP assertions, 17 e2e tests) for
// the same reason: nothing actually visited the page.
//
// Runs against the seeded demo account deliberately, not a throwaway user -- B1 needed
// realistic data (>=2 courses, each with an open deliverable) to reproduce at all; a
// minimal one-course fixture is precisely the shape of test that would have missed it.
// Read-only: every action here is a GET navigation, never a write, so this is safe
// against demo the same way every read-only itest already is.
//
// These credentials mirror packages/api/src/integration/testSupport.ts's
// DEMO_EMAIL/DEMO_PASSWORD -- hardcoded in supabase/seed.sql, stable across `db reset`.
const DEMO_EMAIL = "demo@collegeos.app";
const DEMO_PASSWORD = "CollegeOS-Demo-2026";

const ERROR_PAGE_MARKERS = [/application error/i, /internal server error/i, /unhandled runtime error/i];

async function expectRouteRenders(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `GET ${path}`).toBe(200);
  const bodyText = await page.locator("body").innerText();
  for (const marker of ERROR_PAGE_MARKERS) {
    expect(bodyText, `${path} body should not show an error-page marker (${marker})`).not.toMatch(marker);
  }
}

test.describe("Authenticated route smoke sweep (demo account, realistic data)", () => {
  test("every real, in-nav route renders -- looping over every course and every review date the account actually has", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("email-input").fill(DEMO_EMAIL);
    await page.getByTestId("password-input").fill(DEMO_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/today$/, { timeout: 10_000 });

    // Static routes.
    for (const path of ["/today", "/courses", "/calendar", "/insights", "/review", "/settings"]) {
      await expectRouteRenders(page, path);
    }

    // /courses/[id] -- every course the account actually has, discovered from the
    // Courses list itself (not queried from the DB) so this fails the same way a real
    // user clicking through would, and never degrades to "the first course" if the
    // account's course count ever changes.
    await page.goto("/courses");
    const courseHrefs = await page.locator('a[href^="/courses/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const courseIds = [...new Set(courseHrefs.filter((h): h is string => !!h && /^\/courses\/\d+$/.test(h)))];
    expect(courseIds.length, "the demo account must have at least one course for this sweep to mean anything").toBeGreaterThan(0);
    for (const href of courseIds) {
      await expectRouteRenders(page, href);
    }

    // /review/[date] -- every date in the account's own report history, same
    // discover-from-the-page approach.
    await page.goto("/review");
    const reviewHrefs = await page
      .locator('a[href^="/review/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const reviewDates = [...new Set(reviewHrefs.filter((h): h is string => !!h && /^\/review\/\d{4}-\d{2}-\d{2}$/.test(h)))];
    for (const href of reviewDates) {
      await expectRouteRenders(page, href);
    }
    // A date with no report is a distinct, real path (handled explicitly in the UI) --
    // cover it even if it wasn't in the history list.
    await expectRouteRenders(page, "/review/2026-01-01");

    // /focus/[sessionId] -- both an id that may or may not exist and one that
    // definitely doesn't, since this route is expected to degrade gracefully either way
    // rather than only being exercised on a lucky hit.
    await expectRouteRenders(page, "/focus/1");
    await expectRouteRenders(page, "/focus/999999999");
  });
});
