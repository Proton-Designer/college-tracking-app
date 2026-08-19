import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("renders the hero, the day reading, and both primary CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("app-heading")).toHaveText("The day you planned. The day you had.");
    await expect(page.getByRole("img", { name: /planned schedule against what actually happened/i })).toBeVisible();
    await expect(page.getByTestId("hero-signup")).toHaveAttribute("href", "/signup");
    await expect(page.getByTestId("hero-login")).toHaveAttribute("href", "/login");
  });
});
