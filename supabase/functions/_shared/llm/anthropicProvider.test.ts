// Contract test: proves createAnthropicProvider parses a real Anthropic Messages API
// response shape correctly. This cannot call the live API (no key in this environment)
// -- it stubs `fetch` with a recorded response shape instead. A live smoke test against
// the real API is still required the first time a real key exists (docs/SUPABASE_SETUP.md).

import { assertEquals, assertRejects, assertMatch } from "jsr:@std/assert@1";
import { createAnthropicProvider } from "./anthropicProvider.ts";

// A representative recorded response shape (fields trimmed to what the provider reads).
const GOLDEN_TOOL_USE_RESPONSE = {
  content: [
    { type: "text", text: "I'll analyze this." },
    {
      type: "tool_use",
      id: "toolu_01ABC",
      name: "emit_daily_analysis",
      input: { headline: "Solid day despite a rough start.", confidence: 0.82 },
    },
  ],
  usage: {
    input_tokens: 3200,
    output_tokens: 410,
    cache_read_input_tokens: 2800,
    cache_creation_input_tokens: 0,
  },
};

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("anthropicProvider: parses a golden tool_use response into the provider result shape", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response(JSON.stringify(GOLDEN_TOOL_USE_RESPONSE), { status: 200 })));
  try {
    const provider = createAnthropicProvider("sk-ant-fake-key-for-contract-test");
    const result = await provider.call({
      callType: "nightly_analysis",
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      userContent: "user",
      toolName: "emit_daily_analysis",
      toolInputSchema: {},
      maxTokens: 500,
    });

    assertEquals(result.toolInput, { headline: "Solid day despite a rough start.", confidence: 0.82 });
    assertEquals(result.usage, { inputTokens: 3200, outputTokens: 410, cacheReadTokens: 2800, cacheWriteTokens: 0 });
  } finally {
    restore();
  }
});

Deno.test("anthropicProvider: sends forced tool_choice, never leaving the model free to skip the tool", async () => {
  let capturedBody: Record<string, unknown> | undefined;
  const restore = stubFetch((_input, init) => {
    capturedBody = JSON.parse(init!.body as string);
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_TOOL_USE_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createAnthropicProvider("sk-ant-fake-key-for-contract-test");
    await provider.call({
      callType: "nightly_analysis",
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      userContent: "user",
      toolName: "emit_daily_analysis",
      toolInputSchema: { type: "object" },
      maxTokens: 500,
    });

    assertEquals(capturedBody?.tool_choice, { type: "tool", name: "emit_daily_analysis" });
  } finally {
    restore();
  }
});

Deno.test("anthropicProvider: never sends the API key anywhere but the x-api-key header", async () => {
  let capturedHeaders: Headers | undefined;
  let capturedBody: string | undefined;
  const restore = stubFetch((_input, init) => {
    capturedHeaders = new Headers(init!.headers);
    capturedBody = init!.body as string;
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_TOOL_USE_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createAnthropicProvider("sk-ant-super-secret-value");
    await provider.call({
      callType: "nightly_analysis",
      model: "claude-sonnet-5",
      systemPrompt: "sys",
      userContent: "user",
      toolName: "emit_daily_analysis",
      toolInputSchema: {},
      maxTokens: 500,
    });

    assertEquals(capturedHeaders?.get("x-api-key"), "sk-ant-super-secret-value");
    assertEquals(capturedBody?.includes("sk-ant-super-secret-value"), false);
  } finally {
    restore();
  }
});

Deno.test("anthropicProvider: a response missing the tool_use block throws rather than returning undefined silently", async () => {
  const restore = stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify({ content: [{ type: "text", text: "no tool call here" }], usage: { input_tokens: 10, output_tokens: 5 } }), {
        status: 200,
      }),
    ),
  );
  try {
    const provider = createAnthropicProvider("sk-ant-fake-key-for-contract-test");
    await assertRejects(() =>
      provider.call({
        callType: "nightly_analysis",
        model: "claude-sonnet-5",
        systemPrompt: "sys",
        userContent: "user",
        toolName: "emit_daily_analysis",
        toolInputSchema: {},
        maxTokens: 500,
      }),
    );
  } finally {
    restore();
  }
});

Deno.test("anthropicProvider: a non-2xx response throws with the status code visible, not a silent empty result", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("rate limited", { status: 429 })));
  try {
    const provider = createAnthropicProvider("sk-ant-fake-key-for-contract-test");
    const err = await assertRejects(() =>
      provider.call({
        callType: "nightly_analysis",
        model: "claude-sonnet-5",
        systemPrompt: "sys",
        userContent: "user",
        toolName: "emit_daily_analysis",
        toolInputSchema: {},
        maxTokens: 500,
      }),
    );
    assertMatch((err as Error).message, /429/);
  } finally {
    restore();
  }
});
