// Types for the LLM gateway (docs/LLM_LAYER_SPEC.md §6). Every Anthropic call in
// CollegeOS goes through this contract — no call site talks to the Anthropic SDK
// directly, so the budget gate and schema validation can never be bypassed.

export type LlmModel = "claude-haiku-4-5" | "claude-sonnet-5" | "claude-opus-5";

/** Mirrors LLM_LAYER_SPEC.md §1's call inventory. */
export type LlmCallType =
  | "syllabus_extraction"
  | "nightly_analysis"
  | "weekly_synthesis"
  | "monthly_longitudinal"
  | "semester_retrospective"
  | "coach_chat"
  | "morning_plan_rationale"
  | "friction_classify"
  | "deadline_change_detection";

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** A single forced tool-use call — the only shape of request this gateway makes. */
export interface LlmToolCallRequest {
  callType: LlmCallType;
  model: LlmModel;
  systemPrompt: string;
  userContent: string;
  toolName: string;
  /** JSON Schema for the forced tool. This is a strong prior on the response shape —
   *  never the actual gate. The Zod schema passed to `callLlm` is the gate. */
  toolInputSchema: Record<string, unknown>;
  maxTokens: number;
}

export interface LlmProviderResult {
  /** The raw (unvalidated) JSON the model returned for the forced tool call. */
  toolInput: unknown;
  usage: LlmUsage;
  latencyMs: number;
}

/** Implemented by both the real Anthropic client and the fixture provider used in tests. */
export interface LlmProvider {
  call(request: LlmToolCallRequest): Promise<LlmProviderResult>;
}

export interface UsageLogEntry {
  userId: string | null;
  callType: LlmCallType;
  model: LlmModel;
  usage: LlmUsage;
  costUsd: number;
  latencyMs: number | null;
  success: boolean;
  /** A hash of the response content — NEVER the content itself. See §7 (privacy). */
  contentHash: string | null;
}
