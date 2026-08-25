// The morning brief -- BLUEPRINT 11.2: three lines on the Start Day screen stitching the
// day's signals into English, so "reading the state of your life takes five seconds."
//
// Deterministic-FIRST, the nightly-analysis discipline verbatim: the template brief is
// always built and is a real brief, not a fallback apology. The model call, when budget
// and key allow, rewrites the same facts into natural prose -- it never adds facts,
// which is what makes showing either variant honest.

import { z } from "zod";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

const BRIEF_MODEL = "claude-haiku-4-5" as const;
const BRIEF_MAX_TOKENS = 300;

export interface MorningBriefFacts {
  localDate: string;
  sleepHours: number | null;
  recoveryPct: number | null;
  /** Crowned + starred titles, crown first. */
  mits: string[];
  /** "CODE · title · due Thu" lines, highest risk first. */
  dueSoon: string[];
  /** Count of announcement diffs applied in the last day. */
  announcementsApplied: number;
}

/**
 * The deterministic brief. Never more than three lines, never a fact it wasn't given,
 * and silence about signals that don't exist -- a missing Whoop reading produces no
 * sleep line rather than "sleep unknown", because the brief is a note, not a dashboard.
 */
export function buildDeterministicBrief(facts: MorningBriefFacts): string {
  const lines: string[] = [];

  const bodyParts: string[] = [];
  if (facts.sleepHours != null) bodyParts.push(`Slept ${facts.sleepHours.toFixed(1)}h`);
  if (facts.recoveryPct != null) bodyParts.push(`recovery ${Math.round(facts.recoveryPct)}%`);
  if (bodyParts.length > 0) lines.push(`${bodyParts.join(", ")}.`);

  if (facts.mits.length > 0) {
    lines.push(`MIT: ${facts.mits[0]}${facts.mits.length > 1 ? ` (then ${facts.mits.slice(1).join(", ")})` : ""}.`);
  } else {
    lines.push("No plan from last night -- the Night Plan takes two minutes tonight.");
  }

  const tail: string[] = [];
  if (facts.dueSoon.length > 0) tail.push(`Next up: ${facts.dueSoon[0]}`);
  if (facts.announcementsApplied > 0) {
    tail.push(
      `${facts.announcementsApplied} announcement${facts.announcementsApplied === 1 ? "" : "s"} applied -- plan already adjusted`,
    );
  }
  if (tail.length > 0) lines.push(`${tail.join(". ")}.`);

  return lines.slice(0, 3).join("\n");
}

const BriefSchema = z.object({
  lines: z.array(z.string().min(1)).min(1).max(3),
});

const BRIEF_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 3 },
  },
  required: ["lines"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You write a three-line morning note for a college student from the
facts provided. Plain, direct, no cheerleading, no emoji -- the product's voice keeps
score honestly and does not cheer. NEVER introduce a fact not present in the input; omit
lines for signals that are absent rather than mentioning their absence. Line 1: body
(sleep/recovery) if present. Line 2: the day's MIT. Line 3: nearest deadline and any
already-applied plan changes.`;

export type MorningBriefResult = { brief: string; source: "model" | "deterministic" };

/**
 * Builds the brief, model-first with the deterministic text as both the floor and the
 * model's input -- the model rewrites known facts, it does not get raw data to
 * re-interpret, which keeps the two variants factually identical by construction.
 */
export async function generateMorningBrief(
  gatewayDeps: GatewayDeps,
  input: { userId: string; budgetCeilingUsd: number; facts: MorningBriefFacts },
): Promise<MorningBriefResult> {
  const deterministic = buildDeterministicBrief(input.facts);

  const result = await callLlm(gatewayDeps, {
    userId: input.userId,
    callType: "morning_plan_rationale",
    model: BRIEF_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    userContent: JSON.stringify(input.facts),
    toolName: "emit_morning_brief",
    toolInputSchema: BRIEF_TOOL_SCHEMA,
    maxTokens: BRIEF_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: BriefSchema,
    estimatedInputTokens: 400,
  });

  if (result.kind !== "ok") {
    return { brief: deterministic, source: "deterministic" };
  }
  return { brief: result.data.lines.slice(0, 3).join("\n"), source: "model" };
}

/** Loads the day's facts. Every query is scoped by the user-scoped client's RLS. */
export async function loadBriefFacts(
  client: AnySupabaseClient,
  userId: string,
  localDate: string,
): Promise<MorningBriefFacts> {
  const [health, mits, due, announcements] = await Promise.all([
    client
      .from("health_daily")
      .select("sleep_hours, whoop_recovery_pct")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle(),
    client
      .from("tasks")
      .select("title, mit_rank")
      .eq("user_id", userId)
      .eq("planned_date", localDate)
      .not("mit_rank", "is", null)
      .order("mit_rank", { ascending: true }),
    client
      .from("deliverables")
      .select("title, local_due_date, courses(code)")
      .eq("user_id", userId)
      .neq("status", "completed")
      .gte("local_due_date", localDate)
      .order("local_due_date", { ascending: true })
      .limit(1),
    client
      .from("announcements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "applied")
      .gte("applied_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);

  return {
    localDate,
    sleepHours: health.data?.sleep_hours ?? null,
    recoveryPct: health.data?.whoop_recovery_pct ?? null,
    mits: (mits.data ?? []).map((t: { title: string }) => t.title),
    dueSoon: (due.data ?? []).map(
      (d: { title: string; local_due_date: string; courses: { code: string } | null }) =>
        `${d.courses?.code ?? "?"} · ${d.title} · due ${d.local_due_date}`,
    ),
    announcementsApplied: announcements.count ?? 0,
  };
}
