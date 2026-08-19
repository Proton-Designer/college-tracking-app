import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

// Playwright runs outside Next.js, so .env.local isn't loaded automatically the way it is for
// `next dev`/`next build`. Load it explicitly (Node 20.6+ built-in, no extra dependency).
try {
  process.loadEnvFile(path.resolve(process.cwd(), ".env.local"));
} catch {
  // Absent in CI, where env vars come from the environment directly.
}

const PORT = 3300;
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
  // "setup" produces e2e/.auth/user.json (see auth.setup.ts) but currently skips itself — no
  // /login page exists yet (L3). Once it lands, an authenticated spec/project should add
  // `dependencies: ["setup"]` and `storageState: STORAGE_STATE_PATH` (from ./e2e/constants) to
  // reuse the session instead of signing in per test.
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
      name: "desktop",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /fixtures\//,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /fixtures\//,
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
