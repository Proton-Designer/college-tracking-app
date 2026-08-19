import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { STORAGE_STATE_PATH } from "./e2e/constants";

// Playwright runs outside Next.js, so .env.local isn't loaded automatically the way it is for
// `next dev`/`next build`. Load it explicitly (Node 20.6+ built-in, no extra dependency).
try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
} catch {
  // Absent in CI, where env vars come from the environment directly.
}

// Must match supabase/config.toml's [auth] site_url/additional_redirect_urls — auth email links
// (confirm, reset) are constructed against site_url, so a mismatched port here breaks those flows
// even though everything else works fine on any port.
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // "setup" produces e2e/.auth/user.json (see auth.setup.ts). "authenticated" specs consume it via
  // dependencies + storageState to skip a UI login per test; "desktop"/"mobile" run everything
  // else (including the unauthenticated parts of the auth flow itself) from a clean session.
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // Fixture/harness specs (e.g. e2e/fixtures/harness.spec.ts) prove the test infra itself
    // (test-user factory, Mailpit) against the real local stack. They don't touch a page, so they
    // run once here rather than once per viewport project.
    {
      name: "harness",
      testMatch: /fixtures\/.*\.spec\.ts/,
    },
    {
      name: "authenticated",
      testMatch: /authenticated\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: STORAGE_STATE_PATH },
    },
    {
      name: "desktop",
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/fixtures\//, /authenticated\//],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/fixtures\//, /authenticated\//],
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run dev -- --port " + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
