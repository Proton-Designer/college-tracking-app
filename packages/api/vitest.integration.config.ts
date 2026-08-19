import { defineConfig } from "vitest/config";

// Separate config (not merged into the default unit-test run) for tests that hit the
// real local Supabase stack. Requires `supabase start` to be up.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    testTimeout: 20_000,
    // Loads .env.local and fails loudly (not skips) if required env is missing --
    // see vitest.integration.setup.ts.
    setupFiles: ["./vitest.integration.setup.ts"],
  },
});
