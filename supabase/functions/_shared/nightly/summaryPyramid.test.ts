import { assertEquals } from "jsr:@std/assert@1";
import { buildMonthlySummary, buildWeeklySynthesis, type DailySummaryPayload } from "./summaryPyramid.ts";

Deno.test("buildWeeklySynthesis: a summary row missing newer fields degrades gracefully instead of throwing", () => {
  // Reproduces a real bug found live against seed.sql's hand-authored demo daily
  // summaries (predate several DailySummaryPayload fields) -- `summary` is a jsonb
  // column with no DB-level shape guarantee, so a partial row is a real possibility,
  // not a contrived edge case.
  const partialSummary = { mitsCompleted: 2, deepWorkMin: 130, notableEvent: null } as unknown as DailySummaryPayload;

  const result = buildWeeklySynthesis("2026-08-10", [{ localDate: "2026-08-10", summary: partialSummary }]);

  assertEquals(result.daysWithData, 1);
  assertEquals(result.behavior.frictionCauseCounts, {});
  assertEquals(result.killList, { totalRelapses: 0, totalResisted: 0 });
  assertEquals(result.systemFailureSignals.daysWithDataGaps, 0);
});

Deno.test("buildWeeklySynthesis: a full, real week still aggregates correctly", () => {
  const full: DailySummaryPayload = {
    mitsPlanned: 3,
    mitsCompleted: 2,
    deepWorkPlannedMin: 100,
    deepWorkActualMin: 90,
    recoveryModeTriggered: true,
    planningExecutionDiagnosis: "overplanning",
    startDelayMin: 10,
    topRiskCourseId: 1,
    topRiskScore: 55,
    frictionCauses: ["fatigue", "fatigue", "noise"],
    killListRelapses: 1,
    killListResisted: 2,
    focusSessionsCompleted: 1,
    focusSessionsAbandoned: 0,
    focusMinutesActual: 90,
    notableEvent: "slipped on the reading",
    dataGapCount: 1,
  };

  const result = buildWeeklySynthesis("2026-08-10", [{ localDate: "2026-08-10", summary: full }]);

  assertEquals(result.outcomes.totalMitsCompleted, 2);
  assertEquals(result.outcomes.recoveryModeDays, 1);
  assertEquals(result.planAccuracy.diagnosisCounts, { overplanning: 1 });
  assertEquals(result.planAccuracy.averageStartDelayMin, 10);
  assertEquals(result.academics.peakRiskByCourse, [{ courseId: 1, peakScore: 55 }]);
  assertEquals(result.behavior.frictionCauseCounts, { fatigue: 2, noise: 1 });
  assertEquals(result.killList, { totalRelapses: 1, totalResisted: 2 });
  assertEquals(result.systemFailureSignals, { daysWithNoReview: 0, daysWithDataGaps: 1 });
  assertEquals(result.experiment, null);
});

Deno.test("buildMonthlySummary: the 30-day tier aggregates the same way the 7-day tier does, over a longer window", () => {
  const days: Array<{ localDate: string; summary: DailySummaryPayload }> = Array.from({ length: 25 }, (_, i) => ({
    localDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
    summary: {
      mitsPlanned: 2,
      mitsCompleted: i % 2 === 0 ? 2 : 1,
      deepWorkPlannedMin: 90,
      deepWorkActualMin: 80,
      recoveryModeTriggered: i === 10,
      planningExecutionDiagnosis: "calibrated",
      startDelayMin: 5,
      topRiskCourseId: 1,
      topRiskScore: 40 + i,
      frictionCauses: ["fatigue"],
      killListRelapses: 0,
      killListResisted: 1,
      focusSessionsCompleted: 1,
      focusSessionsAbandoned: 0,
      focusMinutesActual: 80,
      notableEvent: null,
      dataGapCount: 0,
    },
  }));

  const result = buildMonthlySummary("2026-07-01", days);

  assertEquals(result.monthStartDate, "2026-07-01");
  assertEquals(result.monthEndDate, "2026-07-25");
  assertEquals(result.daysWithData, 25);
  assertEquals(result.outcomes.totalMitsPlanned, 50);
  assertEquals(result.outcomes.recoveryModeDays, 1);
  assertEquals(result.planAccuracy.diagnosisCounts, { calibrated: 25 });
  // The highest topRiskScore seen across the whole 25-day window, not just the last day.
  assertEquals(result.academics.peakRiskByCourse, [{ courseId: 1, peakScore: 64 }]);
  assertEquals(result.behavior.frictionCauseCounts, { fatigue: 25 });
  assertEquals(result.killList, { totalRelapses: 0, totalResisted: 25 });
});

Deno.test("buildMonthlySummary: empty input never throws, reports zero data honestly", () => {
  const result = buildMonthlySummary("2026-07-01", []);
  assertEquals(result.daysWithData, 0);
  assertEquals(result.monthEndDate, "2026-07-01"); // falls back to the start date with nothing to span
  assertEquals(result.experiment, null);
});
