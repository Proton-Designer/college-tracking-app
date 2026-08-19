// buildNightlyAnalysisRequest is pure -- takes already-loaded data, does no I/O. This
// tests the assembly logic itself (cache placement, shape) without a database. What
// goes INSIDE `today`/`horizon`/`recentDailySummaries` is assembleReport.ts's and
// summaryPyramid.ts's concern, not this function's -- it only serializes them, so the
// fixtures below are minimal, not full DeterministicNightlyReport shapes.

import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildNightlyAnalysisRequest, type DurableProfile, type HorizonItem } from "./buildContext.ts";
import { DailyAnalysisSchema } from "./dailyAnalysisSchema.ts";
import type { DeterministicNightlyReport } from "./assembleReport.ts";
import type { DailySummaryPayload } from "./summaryPyramid.ts";

const DURABLE_PROFILE: DurableProfile = {
  timezone: "America/New_York",
  sleepBaselineHours: 7.5,
  durableLessons: [
    { lessonId: 1, term: "Spring 2026", lesson: "Morning check-in question #7 produced no actionable insight for 4 weeks -- retired.", confidence: "medium" },
  ],
  courses: [
    {
      courseId: 1,
      name: "Organic Chemistry",
      code: "CHEM201",
      targetGradePct: 90,
      difficultyRating: 4,
      confidenceRating: 3,
      latePolicy: "10% per day",
      attendancePolicy: "3 absences allowed",
      allowedAbsences: 3,
    },
  ],
  activeKillHabits: [
    {
      killHabitId: 1,
      name: "doomscrolling before bed",
      escalationLevel: "firm",
      triggerDescription: "phone on nightstand",
      urgeDescription: "boredom",
      replacementBehavior: "read a physical book",
      implementationIntention: "phone charges in the kitchen after 10pm",
      immediateReward: "novelty",
      longTermCost: "worse sleep, worse next-day focus",
    },
  ],
};

const HORIZON: HorizonItem[] = [
  { deliverableId: 10, courseId: 1, title: "Midterm 2", type: "exam", status: "pending", dueAt: "2026-08-25T14:00:00Z", localDueDate: "2026-08-25" },
];

const RECENT_SUMMARIES: Array<{ localDate: string; summary: DailySummaryPayload }> = [
  {
    localDate: "2026-08-17",
    summary: {
      mitsPlanned: 3,
      mitsCompleted: 2,
      deepWorkPlannedMin: 120,
      deepWorkActualMin: 95,
      recoveryModeTriggered: false,
      planningExecutionDiagnosis: "overplanning",
      startDelayMin: 12,
      topRiskCourseId: 1,
      topRiskScore: 62,
      frictionCauses: ["fatigue"],
      killListRelapses: 0,
      killListResisted: 1,
      focusSessionsCompleted: 2,
      focusSessionsAbandoned: 0,
      focusMinutesActual: 95,
      notableEvent: "underestimated reading load",
      dataGapCount: 0,
    },
  },
];

// Minimal stand-in -- buildNightlyAnalysisRequest never reads into `today`'s fields, it
// only serializes the whole object, so this only needs to satisfy the type shape.
const TODAY = { localDate: "2026-08-18", dataGaps: [] } as unknown as DeterministicNightlyReport;

Deno.test("buildNightlyAnalysisRequest: only the system+durable-profile blocks are cacheable, never the volatile ones", () => {
  const request = buildNightlyAnalysisRequest({
    userId: "u1",
    model: "claude-sonnet-5",
    budgetCeilingUsd: 5,
    maxTokens: 2000,
    estimatedInputTokens: 4000,
    durableProfile: DURABLE_PROFILE,
    recentDailySummaries: RECENT_SUMMARIES,
    today: TODAY,
    horizon: HORIZON,
  });

  assert(Array.isArray(request.systemPrompt));
  const blocks = request.systemPrompt as Array<{ text: string; cacheable: boolean }>;
  assertEquals(blocks.length, 2);
  assert(blocks.every((b) => b.cacheable === true));
  assert(blocks[0]!.text.includes("analysis engine for a personal college accountability system"));
  assert(blocks[1]!.text.includes("Organic Chemistry"));
  assert(blocks[1]!.text.includes("question #7"));

  // The volatile blocks live in userContent, not systemPrompt -- they change every call
  // and would never hit cache, matching §5's ❌ column.
  const userContent = JSON.parse(request.userContent);
  assertEquals(userContent.horizon, HORIZON);
  assertEquals(userContent.recentDailySummaries, RECENT_SUMMARIES);
  assertEquals(userContent.today.localDate, "2026-08-18");
});

Deno.test("buildNightlyAnalysisRequest: the hand-written tool schema accepts a real DailyAnalysis-shaped response", () => {
  const request = buildNightlyAnalysisRequest({
    userId: "u1",
    model: "claude-sonnet-5",
    budgetCeilingUsd: 5,
    maxTokens: 2000,
    estimatedInputTokens: 4000,
    durableProfile: DURABLE_PROFILE,
    recentDailySummaries: RECENT_SUMMARIES,
    today: TODAY,
    horizon: HORIZON,
  });

  assertEquals(request.callType, "nightly_analysis");
  assertEquals(request.toolName, "emit_daily_analysis");

  // A response matching request.toolInputSchema's shape should also pass the real Zod
  // gate (request.schema) -- proves the hand-written JSON schema hint and the actual
  // validator haven't drifted apart.
  const candidateResponse = {
    headline: "Solid focus, weak start.",
    objective_summary: "2 of 3 MITs completed, 95 of 120 planned deep-work minutes.",
    wins: [{ claim: "Resisted the kill habit tonight.", evidence: ["killListResisted: 1"], confidence: 0.9 }],
    failures: [],
    planning_errors: [{ claim: "Overplanned deep work.", evidence: ["deepWorkPlannedMin: 120, actual: 95"], confidence: 0.7 }],
    behavior_patterns: [],
    academic_risks: [{ course_id: "1", note: "Midterm 2 in 7 days, confidence rating is low.", urgency: "medium" }],
    tomorrow_changes: [{ description: "Plan 90 minutes, not 120.", rationale: "Matches the last week's actual completion rate." }],
    kill_list_intervention: null,
    data_gaps: [],
  };
  assertEquals(request.schema, DailyAnalysisSchema);
  const parsed = DailyAnalysisSchema.safeParse(candidateResponse);
  assert(parsed.success);
});
