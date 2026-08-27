// A scriptable fake LlmProvider for offline, no-key, no-cost golden-fixture tests
// (docs/LLM_LAYER_SPEC.md §10). Never makes a network call.

import type { LlmProvider, LlmProviderResult, LlmToolCallRequest, LlmUsage } from "../types.ts";

export type FixtureResponse =
  | { kind: "success"; toolInput: unknown; usage?: Partial<LlmUsage> }
  | { kind: "error"; message: string };

const DEFAULT_USAGE: LlmUsage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Returns each configured response in order, one per `call()`; the last one repeats
 *  after the list is exhausted. Records every request it was called with, so a test can
 *  assert on what actually reached the prompt (e.g. that a caller-side truncation cap
 *  was applied before the call, not just claimed in its return value). */
export function createFixtureProvider(
  responses: FixtureResponse[],
): LlmProvider & { callCount: () => number; requests: () => LlmToolCallRequest[] } {
  let index = 0;
  const requests: LlmToolCallRequest[] = [];

  return {
    callCount: () => requests.length,
    requests: () => requests,
    call(request: LlmToolCallRequest): Promise<LlmProviderResult> {
      requests.push(request);
      const response = responses[Math.min(index, responses.length - 1)];
      index++;
      if (!response) {
        return Promise.reject(new Error("fixtureProvider: no responses configured"));
      }
      if (response.kind === "error") {
        return Promise.reject(new Error(response.message));
      }
      return Promise.resolve({
        toolInput: response.toolInput,
        usage: { ...DEFAULT_USAGE, ...response.usage },
        latencyMs: 42,
      });
    },
  };
}
