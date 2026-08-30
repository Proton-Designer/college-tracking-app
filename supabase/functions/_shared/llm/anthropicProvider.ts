// The real Anthropic-backed LlmProvider. Cannot be exercised against the live API in
// this environment (no ANTHROPIC_API_KEY available) -- its request/response SHAPE is
// contract-tested against a recorded fixture in anthropicProvider.test.ts, and its
// actual network behavior must get a live smoke test the first time a real key exists
// (see docs/SUPABASE_SETUP.md's Anthropic section).

import type { LlmModel, LlmProvider, LlmProviderResult, LlmToolCallRequest, LlmUsage } from "./types.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const MODEL_IDS: Record<LlmModel, string> = {
  "claude-haiku-4-5": "claude-haiku-4-5",
  "claude-sonnet-5": "claude-sonnet-5",
  "claude-opus-5": "claude-opus-5",
};

interface AnthropicSystemTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/** A plain string passes through unchanged (Anthropic accepts `system` as either a
 *  string or a content-block array). An array of SystemPromptBlocks becomes a real
 *  content-block array, with a `cache_control: {type: "ephemeral"}` breakpoint on each
 *  block marked cacheable -- LLM_LAYER_SPEC.md §5: the system prompt + durable profile
 *  are stable across calls and worth caching; today's data and the horizon are not. */
function buildSystemParam(systemPrompt: LlmToolCallRequest["systemPrompt"]): string | AnthropicSystemTextBlock[] {
  if (typeof systemPrompt === "string") return systemPrompt;
  return systemPrompt.map((block) => ({
    type: "text",
    text: block.text,
    ...(block.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

interface AnthropicResponse {
  content: Array<{ type: string; id?: string; name?: string; input?: unknown }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/**
 * A request that never answers must not become a job that never ends.
 *
 * ULM's L6 failure injection found this exact shape: a provider call with no timeout, combined
 * with a heartbeat that runs on a fixed timer independent of pipeline progress, produces an
 * IMMORTAL JOB -- it heartbeats forever, holds its lease forever, and never reaches the
 * retry-then-flag path that exists precisely for a failing provider. Two individually-correct
 * decisions combining into harm (`.brain/memory/lessons.md`).
 *
 * Our re-driver looks at `heartbeat_at`, so we have the same exposure. 90s matches theirs and is
 * comfortably above a slow Sonnet extraction.
 */
const REQUEST_TIMEOUT_MS = 90_000;

export function createAnthropicProvider(apiKey: string): LlmProvider {
  return {
    async call(request: LlmToolCallRequest): Promise<LlmProviderResult> {
      const started = Date.now();

      // `AbortSignal.timeout` rejects with a TimeoutError DOMException, which the gateway's
      // catch already treats as a provider failure -- so a hang now takes the same path a 500
      // does rather than a path of its own.
      const response = await fetch(ANTHROPIC_API_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL_IDS[request.model],
          max_tokens: request.maxTokens,
          system: buildSystemParam(request.systemPrompt),
          messages: [{ role: "user", content: request.userContent }],
          tools: [
            {
              name: request.toolName,
              input_schema: request.toolInputSchema,
            },
          ],
          // Forced tool use -- LLM_LAYER_SPEC.md §3: enforcement, not hope.
          tool_choice: { type: "tool", name: request.toolName },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as AnthropicResponse;
      const toolUseBlock = data.content.find((block) => block.type === "tool_use");
      if (!toolUseBlock) {
        throw new Error("Anthropic response contained no tool_use block despite forced tool_choice");
      }

      const usage: LlmUsage = {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        cacheReadTokens: data.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: data.usage.cache_creation_input_tokens ?? 0,
      };

      return { toolInput: toolUseBlock.input, usage, latencyMs: Date.now() - started };
    },
  };
}
