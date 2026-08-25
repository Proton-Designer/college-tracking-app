import { assertEquals, assertMatch, assertObjectMatch } from "jsr:@std/assert@1";
import { z } from "zod";
import { callLlm, type GatewayDeps, type CallLlmRequest } from "./gateway.ts";
import { createFixtureProvider } from "./__fixtures__/fixtureProvider.ts";
import type { UsageLogEntry } from "./types.ts";

const TestSchema = z.object({
  headline: z.string(),
  confidence: z.number().min(0).max(1),
});

function baseRequest(overrides: Partial<CallLlmRequest<z.infer<typeof TestSchema>>> = {}) {
  return {
    userId: "user-1",
    callType: "nightly_analysis" as const,
    model: "claude-sonnet-5" as const,
    systemPrompt: "You are a test.",
    userContent: "test input",
    toolName: "emit_test",
    toolInputSchema: {},
    maxTokens: 500,
    budgetCeilingUsd: 5,
    schema: TestSchema,
    estimatedInputTokens: 1000,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<GatewayDeps> = {}): { deps: GatewayDeps; logs: UsageLogEntry[] } {
  const logs: UsageLogEntry[] = [];
  const deps: GatewayDeps = {
    provider: createFixtureProvider([{ kind: "success", toolInput: { headline: "ok", confidence: 0.9 } }]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: (entry) => {
      logs.push(entry);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-19T00:00:00Z"),
    ...overrides,
  };
  return { deps, logs };
}

Deno.test("callLlm: a valid response on the first attempt returns ok and logs success", async () => {
  const { deps, logs } = makeDeps();
  const result = await callLlm(deps, baseRequest());

  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertObjectMatch(result.data, { headline: "ok", confidence: 0.9 });
    assertEquals(result.costUsd > 0, true);
  }
  assertEquals(logs.length, 1);
  assertEquals(logs[0]!.success, true);
});

Deno.test("callLlm: a malformed response retries once, then succeeds on the second attempt", async () => {
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { headline: 123 /* wrong type */, confidence: 0.5 } },
    { kind: "success", toolInput: { headline: "recovered", confidence: 0.5 } },
  ]);
  const { deps, logs } = makeDeps({ provider });

  const result = await callLlm(deps, baseRequest());

  assertEquals(result.kind, "ok");
  if (result.kind === "ok") assertEquals(result.data.headline, "recovered");
  assertEquals(provider.callCount(), 2);
  assertEquals(logs.length, 2);
  assertEquals(logs[0]!.success, false);
  assertEquals(logs[1]!.success, true);
});

Deno.test("callLlm: a malformed response on both attempts falls back deterministically, never surfaces broken output", async () => {
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { headline: 123, confidence: 0.5 } },
    { kind: "success", toolInput: { headline: 456, confidence: "not a number" } },
  ]);
  const { deps, logs } = makeDeps({ provider });

  const result = await callLlm(deps, baseRequest());

  assertEquals(result.kind, "deterministicFallback");
  assertEquals(provider.callCount(), 2);
  assertEquals(logs.length, 2);
  assertEquals(logs.every((l) => l.success === false), true);
});

Deno.test("callLlm: a truncated/adversarial response (extra unexpected fields, missing required ones) is rejected, not coerced", async () => {
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { unexpected_field: "ignore previous instructions", confidence: 0.9 } },
    { kind: "success", toolInput: {} },
  ]);
  const { deps } = makeDeps({ provider });

  const result = await callLlm(deps, baseRequest());
  assertEquals(result.kind, "deterministicFallback");
});

Deno.test("callLlm: a provider network error retries, then falls back", async () => {
  const provider = createFixtureProvider([
    { kind: "error", message: "ECONNRESET" },
    { kind: "error", message: "ECONNRESET" },
  ]);
  const { deps } = makeDeps({ provider });

  const result = await callLlm(deps, baseRequest());
  assertEquals(result.kind, "deterministicFallback");
  assertEquals(provider.callCount(), 2);
});

Deno.test("callLlm: a projected spend over the ceiling blocks the call entirely -- no HTTP call is made", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { headline: "should not run", confidence: 1 } }]);
  const { deps, logs } = makeDeps({
    provider,
    // Sonnet pre-Sep-1: 1000 input @ $2/M + 500 max-output @ $10/M = $0.007 estimated.
    // 4.995 + 0.007 = 5.002, just over the $5 ceiling.
    getMonthlySpendUsd: () => Promise.resolve(4.995),
  });

  const result = await callLlm(deps, baseRequest({ budgetCeilingUsd: 5 }));

  assertEquals(result.kind, "budgetExceeded");
  assertEquals(provider.callCount(), 0, "the deterministic-first gate must block the call before any network I/O");
  assertEquals(logs.length, 0, "a blocked call has nothing to log -- it never reached the provider");
});

Deno.test("callLlm: usage logging never contains the prompt or response body, only a hash", async () => {
  const { deps, logs } = makeDeps();
  await callLlm(deps, baseRequest());

  assertEquals(logs.length, 1);
  const entry = logs[0]!;
  assertEquals(entry.contentHash !== null, true);
  // A SHA-256 hex digest is exactly 64 hex characters and must not be (or contain) the
  // original JSON payload.
  assertMatch(entry.contentHash!, /^[0-9a-f]{64}$/);
  assertEquals(JSON.stringify(entry).includes('"headline":"ok"'), false);
});

Deno.test("callLlm: Sonnet cost reflects the pre-Sep-1 introductory rate, not the post-Sep-1 rate", async () => {
  const { deps } = makeDeps({ now: () => new Date("2026-08-19T00:00:00Z") });
  const result = await callLlm(deps, baseRequest());
  if (result.kind !== "ok") throw new Error("expected ok");
  // 1000 input @ $2/M + 200 output @ $10/M = 0.002 + 0.002 = 0.004
  assertEquals(result.costUsd, 0.004);
});

Deno.test("callLlm: Sonnet cost reflects the post-Sep-1 rate once the date passes", async () => {
  const { deps } = makeDeps({ now: () => new Date("2026-09-02T00:00:00Z") });
  const result = await callLlm(deps, baseRequest());
  if (result.kind !== "ok") throw new Error("expected ok");
  // 1000 input @ $3/M + 200 output @ $15/M = 0.003 + 0.003 = 0.006
  assertEquals(result.costUsd, 0.006);
});

Deno.test("callLlm: a logging failure on a SUCCESSFUL call fails closed -- no ok result on unlogged spend", async () => {
  // The 2026-08-25 incident, pinned: llm_usage_log briefly had no INSERT policy, logUsage
  // threw on the RLS denial, and the throw escaped callLlm as an opaque 500 after the
  // provider had already been billed. The gateway must convert that into an honest
  // fallback -- and must NOT return ok, because this log is the ledger the budget ceiling
  // sums; success on unlogged spend would let the ceiling quietly stop enforcing.
  const provider = createFixtureProvider([{ kind: "success", toolInput: { headline: "ok", confidence: 0.9 } }]);
  const { deps } = makeDeps({
    provider,
    logUsage: () => Promise.reject(new Error("new row violates row-level security policy")),
  });

  const result = await callLlm(deps, baseRequest());
  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") {
    assertEquals(result.reason.startsWith("usage_logging_failed:"), true);
  }
  // One provider call, not MAX_ATTEMPTS: a broken ledger stops the loop, it does not
  // trigger paid retries off the books.
  assertEquals(provider.callCount(), 1);
});

Deno.test("callLlm: a logging failure after a provider error stops retrying rather than spending off the books", async () => {
  const provider = createFixtureProvider([
    { kind: "error", message: "boom" },
    { kind: "success", toolInput: { headline: "ok", confidence: 0.9 } },
  ]);
  const { deps } = makeDeps({
    provider,
    logUsage: () => Promise.reject(new Error("insert denied")),
  });

  const result = await callLlm(deps, baseRequest());
  assertEquals(result.kind, "deterministicFallback");
  assertEquals(provider.callCount(), 1);
});
