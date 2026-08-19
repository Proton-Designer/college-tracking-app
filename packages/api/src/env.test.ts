import { describe, expect, it } from "vitest";
import { resolveAppEnvironment } from "./env";

describe("resolveAppEnvironment", () => {
  it("resolves local mode for a loopback URL", () => {
    const env = resolveAppEnvironment({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
      debugLabel: "web",
    });
    expect(env.mode).toBe("local");
    expect(env.debugLabel).toBe("web");
  });

  it("resolves cloud mode for a non-loopback URL", () => {
    const env = resolveAppEnvironment({
      supabaseUrl: "https://abcdefgh.supabase.co",
      supabaseAnonKey: "anon-key",
    });
    expect(env.mode).toBe("cloud");
    expect(env.debugLabel).toBeUndefined();
  });

  it("throws when required values are missing", () => {
    expect(() =>
      resolveAppEnvironment({ supabaseUrl: undefined, supabaseAnonKey: undefined }),
    ).toThrow();
  });
});
