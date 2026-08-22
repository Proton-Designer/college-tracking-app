// Assembles LLM_LAYER_SPEC.md §5's context envelope for the nightly_analysis call: two
// stable, cached blocks (system prompt + output contract, durable profile) and three
// volatile, uncached blocks (7-day recent context, today, 14-day horizon). Only the
// cached blocks live in `systemPrompt` -- SystemPromptBlock's cache_control breakpoint
// only makes sense on content that's stable call-to-call; the three volatile blocks go
// in `userContent`, which the gateway never marks cacheable.
//
// The `packages/core` outputs sent in "today" (risk scores + factor contributions,
// grade projections, planning-vs-execution diagnosis, bounce-back, Recovery Mode) already
// carry the per-factor trace data spec calls "engine outputs with traces" -- assembleReport.ts
// builds that shape once; this file does not recompute it, only packages it for the call.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { z } from "zod";
import { addDays, type LocalDate } from "../core/index.ts";
import type { LlmModel, SystemPromptBlock } from "../llm/types.ts";
import type { CallLlmRequest } from "../llm/gateway.ts";
import { DailyAnalysisSchema } from "./dailyAnalysisSchema.ts";
import type { DeterministicNightlyReport } from "./assembleReport.ts";
import type { DailySummaryPayload } from "./summaryPyramid.ts";

// Verbatim from LLM_LAYER_SPEC.md §4, so the deployed prompt and the documented one can
// never silently drift apart.
const NIGHTLY_SYSTEM_PROMPT = `You are the analysis engine for a personal college accountability system.
Your goal is behavior change, not reassurance.

You receive structured, ALREADY-COMPUTED information. Every number you are given
was calculated by deterministic code and is correct. Do not recompute, re-derive,
or second-guess any figure. Your job is to interpret them.

Rules:
1.  Prefer objective behavior over the user's self-assessment when they conflict.
2.  Do not infer causality from correlation.
3.  Identify alternative explanations.
4.  Challenge rationalizations when the evidence supports doing so.
5.  Do not manufacture patterns from insufficient data. Saying "not enough data"
    is a correct and valued answer.
6.  Prefer changing systems and environment over recommending more motivation.
7.  Recommend no more than three changes for tomorrow.
8.  Distinguish observation, hypothesis, and conclusion.
9.  Never diagnose psychological or medical conditions.
10. Be direct but not insulting. No hype, no filler, no praise that isn't earned
    by a specific event in the data.
11. Every claim must cite a specific data point you were given. A claim you cannot
    cite must be dropped or demoted to a hypothesis.
12. Physiology explains HOW and WHEN to work. It never justifies not working.

Call the emit_daily_analysis tool with your response. Every entry in wins/failures/
planning_errors/behavior_patterns must cite evidence from the data you were given.
If you cannot assess something, say so in data_gaps rather than inventing a pattern.`;

// ============================================================================
// Durable profile (cached) -- goals, active habits, kill-list definitions, course
// policies, semester context, durable lessons per §5's table.
//
// Scope note: "goals" (no goals table exists in the schema yet) is a real part of §5's
// durable profile with no source to read from yet. Flagged here rather than silently
// omitted, same honesty rule the `lenses` field (§2) used to follow before it was built.
// "Durable lessons" (semester_lessons, L8) is wired in below.
// ============================================================================

export interface CourseDurableProfile {
  courseId: number;
  name: string;
  code: string;
  targetGradePct: number | null;
  difficultyRating: number | null;
  confidenceRating: number | null;
  latePolicy: string | null;
  attendancePolicy: string | null;
  allowedAbsences: number | null;
}

export interface KillHabitDurableProfile {
  killHabitId: number;
  name: string;
  escalationLevel: string;
  triggerDescription: string | null;
  urgeDescription: string | null;
  replacementBehavior: string | null;
  implementationIntention: string | null;
  immediateReward: string | null;
  longTermCost: string | null;
}

export interface DurableLessonProfile {
  lessonId: number;
  term: string;
  lesson: string;
  confidence: string;
  sourceInsightId: number | null;
  /** How many retrospective runs independently promoted this same insight. >1 is real
   *  evidence of durability, stated explicitly here -- never smuggled in by sending the
   *  same lesson text multiple times in the cached prompt (that would read as emphasis
   *  the model can't tell apart from repeated evidence). */
  confirmationCount: number;
}

export interface DurableProfile {
  timezone: string;
  sleepBaselineHours: number | null;
  courses: CourseDurableProfile[];
  activeKillHabits: KillHabitDurableProfile[];
  durableLessons: DurableLessonProfile[];
}

/** Rows must already be ordered newest-first (created_at desc). Lessons with a
 *  non-null source_insight_id collapse to their most recent row, with a count of how
 *  many rows shared that source; lessons with no source (manual, or pre-migration)
 *  pass through individually, uncounted. */
// deno-lint-ignore no-explicit-any
function dedupeDurableLessons(rows: any[]): DurableLessonProfile[] {
  const bySourceInsight = new Map<number, DurableLessonProfile>();
  const unsourced: DurableLessonProfile[] = [];

  for (const row of rows) {
    if (row.source_insight_id == null) {
      unsourced.push({ lessonId: row.id, term: row.term, lesson: row.lesson, confidence: row.confidence, sourceInsightId: null, confirmationCount: 1 });
      continue;
    }
    const existing = bySourceInsight.get(row.source_insight_id);
    if (existing) {
      existing.confirmationCount += 1; // this row is an older re-confirmation of the same insight
    } else {
      // First row seen for this source_insight_id IS the most recent, since rows arrive newest-first.
      bySourceInsight.set(row.source_insight_id, {
        lessonId: row.id,
        term: row.term,
        lesson: row.lesson,
        confidence: row.confidence,
        sourceInsightId: row.source_insight_id,
        confirmationCount: 1,
      });
    }
  }

  return [...bySourceInsight.values(), ...unsourced];
}

export async function loadDurableProfile(client: AnySupabaseClient, userId: string): Promise<DurableProfile> {
  const [
    { data: profile, error: profileError },
    { data: courses, error: coursesError },
    { data: habits, error: habitsError },
    { data: lessons, error: lessonsError },
  ] = await Promise.all([
    client.from("profiles").select("timezone, sleep_baseline_hours").eq("id", userId).single(),
    client
      .from("courses")
      .select("id, name, code, target_grade_pct, difficulty_rating, confidence_rating, late_policy, attendance_policy, allowed_absences")
      .eq("user_id", userId)
      .is("archived_at", null),
    client
      .from("kill_habits")
      .select(
        "id, name, escalation_level, trigger_description, urge_description, replacement_behavior, implementation_intention, immediate_reward, long_term_cost",
      )
      .eq("user_id", userId)
      .eq("active", true),
    // Every durable lesson ever recorded (L8), not scoped to the current term -- a
    // lesson from a prior semester is exactly the kind of thing that should still
    // inform this one (append-only, DATA_MODEL.md §5, so this list only ever grows).
    // Deduped below by source_insight_id, newest first -- a re-run of the semester
    // retrospective re-promotes the same insight as a genuine new row (a
    // re-confirmation is real signal), but must appear exactly once here, not once per
    // run, or it silently gains false emphasis in the cached prompt.
    client
      .from("semester_lessons")
      .select("id, term, lesson, confidence, source_insight_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  if (profileError) throw profileError;
  if (coursesError) throw coursesError;
  if (habitsError) throw habitsError;
  if (lessonsError) throw lessonsError;

  return {
    timezone: profile.timezone,
    sleepBaselineHours: profile.sleep_baseline_hours,
    durableLessons: dedupeDurableLessons(lessons ?? []),
    // deno-lint-ignore no-explicit-any
    courses: (courses ?? []).map((c: any) => ({
      courseId: c.id,
      name: c.name,
      code: c.code,
      targetGradePct: c.target_grade_pct,
      difficultyRating: c.difficulty_rating,
      confidenceRating: c.confidence_rating,
      latePolicy: c.late_policy,
      attendancePolicy: c.attendance_policy,
      allowedAbsences: c.allowed_absences,
    })),
    // deno-lint-ignore no-explicit-any
    activeKillHabits: (habits ?? []).map((h: any) => ({
      killHabitId: h.id,
      name: h.name,
      escalationLevel: h.escalation_level,
      triggerDescription: h.trigger_description,
      urgeDescription: h.urge_description,
      replacementBehavior: h.replacement_behavior,
      implementationIntention: h.implementation_intention,
      immediateReward: h.immediate_reward,
      longTermCost: h.long_term_cost,
    })),
  };
}

// ============================================================================
// Horizon (uncached) -- upcoming academic obligations, next 14 days.
// ============================================================================

export interface HorizonItem {
  deliverableId: number;
  courseId: number;
  title: string;
  type: string;
  status: string;
  dueAt: string;
  localDueDate: LocalDate;
}

export async function loadHorizon(
  client: AnySupabaseClient,
  userId: string,
  localDate: LocalDate,
  days = 14,
): Promise<HorizonItem[]> {
  const until = addDays(localDate, days);
  const { data, error } = await client
    .from("deliverables")
    .select("id, course_id, title, type, status, due_at, local_due_date")
    .eq("user_id", userId)
    .gte("local_due_date", localDate)
    .lte("local_due_date", until)
    .order("local_due_date");
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((d: any) => ({
    deliverableId: d.id,
    courseId: d.course_id,
    title: d.title,
    type: d.type,
    status: d.status,
    dueAt: d.due_at,
    localDueDate: d.local_due_date,
  }));
}

// ============================================================================
// Request assembly
// ============================================================================

// Hand-written JSON Schema mirroring dailyAnalysisSchema.ts's DailyAnalysisSchema.
// This is the forced-tool-use request's strong prior on shape (§3) -- Zod validation
// after the response comes back is the actual gate, never this.
const EVIDENCE_CLAIM_JSON_SCHEMA = {
  type: "object",
  properties: {
    claim: { type: "string" },
    evidence: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["claim", "evidence", "confidence"],
};

const DAILY_ANALYSIS_TOOL_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    objective_summary: { type: "string" },
    wins: { type: "array", items: EVIDENCE_CLAIM_JSON_SCHEMA },
    failures: { type: "array", items: EVIDENCE_CLAIM_JSON_SCHEMA },
    planning_errors: { type: "array", items: EVIDENCE_CLAIM_JSON_SCHEMA },
    behavior_patterns: { type: "array", items: EVIDENCE_CLAIM_JSON_SCHEMA },
    academic_risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          course_id: { type: "string" },
          note: { type: "string" },
          urgency: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["course_id", "note", "urgency"],
      },
    },
    // LLM_LAYER_SPEC.md §2 -- one inference emits every lens as a field. Per-property
    // descriptions carry §2's behavioral rules into the request, since the verbatim §4
    // system prompt (NIGHTLY_SYSTEM_PROMPT above) intentionally stays byte-identical to
    // the spec and doesn't mention lenses.
    lenses: {
      type: "object",
      properties: {
        executive_coach: { type: "string", description: "High-level operational read: what to prioritize tomorrow and why, given the plan-vs-execution gap." },
        academic_strategist: { type: "string", description: "Focused specifically on course/deliverable risk and grade trajectory." },
        behavior_analyst: { type: "string", description: "Focused on behavioral patterns: kill-list habits, friction causes, focus session quality." },
        skeptic: {
          type: "string",
          description:
            "Must be non-empty. Reference concrete evidence that contradicts or complicates the other lenses' framing. If there is truly nothing to contest, say so explicitly rather than leaving this thin.",
        },
        systems_engineer: { type: "string", description: "Structural/environmental fixes (schedule, location, defaults) rather than willpower -- rule 6." },
        motivator: {
          type: "string",
          description: "Short -- a sentence or two. Must cite one specific event from today's data. Generic encouragement is a schema violation, not a style preference.",
        },
        recovery_coach: {
          type: "string",
          description:
            "Populate ONLY when today.recoveryMode.triggered is true in the data you were given. Otherwise return an empty string. You do not decide whether a crisis exists -- the deterministic engine already has.",
        },
      },
      required: ["executive_coach", "academic_strategist", "behavior_analyst", "skeptic", "systems_engineer", "motivator", "recovery_coach"],
    },
    tomorrow_changes: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: { description: { type: "string" }, rationale: { type: "string" } },
        required: ["description", "rationale"],
      },
    },
    kill_list_intervention: {
      type: ["object", "null"],
      properties: { description: { type: "string" }, rationale: { type: "string" } },
      required: ["description", "rationale"],
    },
    data_gaps: { type: "array", items: { type: "string" } },
  },
  required: [
    "headline",
    "objective_summary",
    "wins",
    "failures",
    "planning_errors",
    "behavior_patterns",
    "academic_risks",
    "lenses",
    "tomorrow_changes",
    "kill_list_intervention",
    "data_gaps",
  ],
};

export interface NightlyAnalysisContextInput {
  userId: string;
  model: LlmModel;
  budgetCeilingUsd: number;
  maxTokens: number;
  /** Rough pre-flight estimate for the gateway's budget pre-flight check -- the caller
   *  measures the assembled content, this function doesn't guess at it. */
  estimatedInputTokens: number;
  durableProfile: DurableProfile;
  recentDailySummaries: Array<{ localDate: LocalDate; summary: DailySummaryPayload }>;
  today: DeterministicNightlyReport;
  horizon: HorizonItem[];
}

/** Builds the CallLlmRequest for a nightly_analysis call. Pure -- takes already-loaded
 *  data, does no I/O itself, so it's trivially testable without a database. */
export function buildNightlyAnalysisRequest(
  input: NightlyAnalysisContextInput,
): CallLlmRequest<z.infer<typeof DailyAnalysisSchema>> {
  const systemPrompt: SystemPromptBlock[] = [
    { text: NIGHTLY_SYSTEM_PROMPT, cacheable: true },
    { text: `Durable profile (goals in courses, active kill-list habits, course policies):\n${JSON.stringify(input.durableProfile)}`, cacheable: true },
  ];

  const userContent = JSON.stringify({
    recentDailySummaries: input.recentDailySummaries,
    today: input.today,
    horizon: input.horizon,
  });

  return {
    callType: "nightly_analysis",
    model: input.model,
    systemPrompt,
    userContent,
    toolName: "emit_daily_analysis",
    toolInputSchema: DAILY_ANALYSIS_TOOL_SCHEMA,
    maxTokens: input.maxTokens,
    userId: input.userId,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: DailyAnalysisSchema,
    estimatedInputTokens: input.estimatedInputTokens,
  };
}
