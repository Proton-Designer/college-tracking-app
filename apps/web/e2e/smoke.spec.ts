import { test, expect } from "@playwright/test";

test.describe("L0 skeleton", () => {
  test("renders and surfaces the local Supabase environment", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("app-heading")).toHaveText("CollegeOS");
    await expect(page.getByTestId("env-source")).toHaveText("web");
    await expect(page.getByTestId("env-mode")).toHaveText("local");
    await expect(page.getByTestId("env-supabase-url")).toHaveText("http://127.0.0.1:54321");
  });
});
