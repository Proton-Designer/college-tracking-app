import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // .itest.ts (not .test.ts) is a deliberately distinct suffix: integration tests hit
    // the real local Supabase stack (auth server, Postgres, Mailpit) and must never run
    // as part of the default fast unit-test pass. Run them with `npm run test:integration`
    // once `supabase start` is up.
    include: ["src/**/*.test.ts"],
  },
});
