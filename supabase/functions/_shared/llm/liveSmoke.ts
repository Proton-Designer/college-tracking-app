// The live smoke test docs/SUPABASE_SETUP.md §7 step 2 calls for -- one real call per
// model, run MANUALLY, the first time a real ANTHROPIC_API_KEY exists. Written against
// createAnthropicProvider directly so what is being smoked is the exact request/response
// path the gateway uses, not a lookalike.
//
// Gated twice so it can never run in normal CI: it exits unless LIVE_SMOKE=1, and it
// needs a real key in the environment. It never prints response content or the key --
// only shape checks and token counts.
//
//   LIVE_SMOKE=1 ANTHROPIC_API_KEY=sk-... deno run --allow-net --allow-env _shared/llm/liveSmoke.ts
//
// What it proves, per model: the request is accepted, forced tool_choice actually yields
// a tool_use block, the tool input parses against the requested schema, and the usage
// fields the fixture assumed (input_tokens, output_tokens, cache fields) are present.
// If any of this fails, the FIXTURE is what must change -- update it from reality, never
// patch the test to pass (the §7 rule).

import { createAnthropicProvider } from "./anthropicProvider.ts";
import type { LlmModel } from "./types.ts";

if (Deno.env.get("LIVE_SMOKE") !== "1") {
  console.log("liveSmoke: LIVE_SMOKE=1 not set; refusing to spend real money. Exiting.");
  Deno.exit(0);
}
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("liveSmoke: no ANTHROPIC_API_KEY in the environment.");
  Deno.exit(1);
}

const MODELS: LlmModel[] = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"];

const provider = createAnthropicProvider(apiKey);
let failed = false;

for (const model of MODELS) {
  try {
    const result = await provider.call({
      // Arbitrary but valid: anthropicProvider.call() never reads callType (it's a
      // gateway-logging field, not part of the actual request), and there is no
      // dedicated smoke-test call type -- "classify" is the closest existing match to
      // what this script actually does.
      callType: "friction_classify",
      model,
      maxTokens: 64,
      systemPrompt: "You classify colors. Use the tool.",
      userContent: "Classify: 'crimson'. warm or cool?",
      toolName: "classify_color",
      toolInputSchema: {
        type: "object",
        properties: { temperature: { type: "string", enum: ["warm", "cool"] } },
        required: ["temperature"],
        additionalProperties: false,
      },
    });

    const input = result.toolInput as { temperature?: unknown };
    const shapeOk =
      (input.temperature === "warm" || input.temperature === "cool") &&
      Number.isFinite(result.usage.inputTokens) &&
      Number.isFinite(result.usage.outputTokens) &&
      Number.isFinite(result.usage.cacheReadTokens) &&
      Number.isFinite(result.usage.cacheWriteTokens);

    console.log(
      `${model}: ${shapeOk ? "OK" : "SHAPE MISMATCH"} ` +
        `(in=${result.usage.inputTokens} out=${result.usage.outputTokens} ${result.latencyMs}ms)`,
    );
    if (!shapeOk) failed = true;
  } catch (e) {
    console.error(`${model}: FAILED -- ${e instanceof Error ? e.message : String(e)}`);
    failed = true;
  }
}

Deno.exit(failed ? 1 : 0);
