// Context envelope for the weekly_synthesis call -- same cached/uncached split as
// buildContext.ts's nightly version (System + Durable profile cached; the week's
// deterministic synthesis uncached, since it's different every week and would never hit
// cache). Weekly calls are "not latency-sensitive" per LLM_LAYER_SPEC.md §6, eligible
// for the Batch API discount -- not wired here (no key to batch against tonight), but
// the request shape doesn't preclude it later.

import { z } from "zod";
import type { LlmModel, SystemPromptBlock } from "../llm/types.ts";
import type { CallLlmRequest } from "../llm/gateway.ts";
import { WeeklyAnalysisSchema } from "./weeklyAnalysisSchema.ts";
import type { DurableProfile } from "./buildContext.ts";
import type { WeeklySynthesisPayload } from "./summaryPyramid.ts";

const WEEKLY_SYSTEM_PROMPT = `You are the weekly analysis engine for a personal college accountability system.
Your goal is behavior change, not reassurance. Weekly is where you do deeper reasoning
than the nightly pass -- you have a full week of already-computed outcomes, not one day.

You receive structured, ALREADY-COMPUTED information. Every number you are given was
calculated by deterministic code and is correct. Do not recompute, re-derive, or
second-guess any figure. Your job is to interpret them.

Rules:
1.  Prefer objective behavior over the user's self-assessment when they conflict.
2.  Do not infer causality from correlation.
3.  Identify alternative explanations.
4.  Challenge rationalizations when the evidence supports doing so.
5.  Do not manufacture patterns from insufficient data. Saying "not enough data" is a
    correct and valued answer -- especially for a single week.
6.  Prefer changing systems and environment over recommending more motivation.
7.  Propose at most one experiment for next week. Not every week needs a new one -- if
    the current one is still running and hasn't had time to show an effect, say so and
    propose null.
8.  Distinguish observation, hypothesis, and conclusion.
9.  Never diagnose psychological or medical conditions.
10. Be direct but not insulting. No hype, no filler, no praise that isn't earned by a
    specific pattern in the week's data.
11. Every claim must cite a specific data point you were given. A claim you cannot cite
    must be dropped or demoted to a hypothesis.
12. Physiology explains HOW and WHEN to work. It never justifies not working.
13. The SYSTEM FAILURE section is not optional filler -- it is the accountability engine
    optimizing itself. If a recurring signal (a check-in question, a tracked metric, a
    report section) has produced no actionable insight across the week, say so plainly,
    the way a human coach would say "this isn't working, let's cut it."

Call the emit_weekly_analysis tool with your response. Every entry in system_failure
must cite evidence. If you cannot assess something, say so in data_gaps rather than
inventing a pattern.`;

const EVIDENCE_CLAIM_JSON_SCHEMA = {
  type: "object",
  properties: {
    claim: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["claim", "evidence", "confidence"],
};

const WEEKLY_ANALYSIS_TOOL_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    objective_summary: { type: "string" },
    plan_accuracy_note: { type: "string" },
    academic_note: { type: "string" },
    behavior_note: { type: "string" },
    health_note: { type: "string" },
    system_failure: { type: "array", items: EVIDENCE_CLAIM_JSON_SCHEMA },
    proposed_experiment: {
      type: ["object", "null"],
      properties: {
        hypothesis: { type: "string" },
        protocol: { type: "string" },
        rationale: { type: "string" },
      },
      required: ["hypothesis", "protocol", "rationale"],
    },
    data_gaps: { type: "array", items: { type: "string" } },
  },
  required: [
    "headline",
    "objective_summary",
    "plan_accuracy_note",
    "academic_note",
    "behavior_note",
    "health_note",
    "system_failure",
    "proposed_experiment",
    "data_gaps",
  ],
};

export interface WeeklySynthesisContextInput {
  userId: string;
  model: LlmModel;
  budgetCeilingUsd: number;
  maxTokens: number;
  estimatedInputTokens: number;
  durableProfile: DurableProfile;
  weeklySynthesis: WeeklySynthesisPayload;
}

export function buildWeeklySynthesisRequest(
  input: WeeklySynthesisContextInput,
): CallLlmRequest<z.infer<typeof WeeklyAnalysisSchema>> {
  const systemPrompt: SystemPromptBlock[] = [
    { text: WEEKLY_SYSTEM_PROMPT, cacheable: true },
    { text: `Durable profile (goals in courses, active kill-list habits, course policies):\n${JSON.stringify(input.durableProfile)}`, cacheable: true },
  ];

  const userContent = JSON.stringify({ weeklySynthesis: input.weeklySynthesis });

  return {
    callType: "weekly_synthesis",
    model: input.model,
    systemPrompt,
    userContent,
    toolName: "emit_weekly_analysis",
    toolInputSchema: WEEKLY_ANALYSIS_TOOL_SCHEMA,
    maxTokens: input.maxTokens,
    userId: input.userId,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: WeeklyAnalysisSchema,
    estimatedInputTokens: input.estimatedInputTokens,
  };
}
