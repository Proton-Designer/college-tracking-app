// Type-only shape of the nightly agent report -- the full contract from
// LLM_LAYER_SPEC.md §2/§3, as one definition instead of two hand-maintained copies. The
// Deno edge function (supabase/functions/_shared/nightly/*.ts, via the generated core
// mirror -- see decisions.md D16) produces this shape; packages/api (web + mobile)
// consumes it as already-validated data. Before this file, both sides hand-declared
// their own copy of the same interfaces -- a drift risk with no guard, unlike D16's own
// mirror (which check-core-mirror does guard). One definition, covered by that same
// guard, closes the gap.
//
// This file contains no logic -- it describes what the assembly code elsewhere produces
// and what the Zod schema (dailyAnalysisSchema.ts, Deno-only, since only the edge
// function ever validates a model response) enforces at runtime.

import type { BounceBackResult } from '../bounceback/bounceBack';
import type { CauseTrendEntry, FrictionDistribution } from '../friction/frictionAnalytics';
import type { CourseGradeProjection } from '../grades/types';
import type { PlanningExecutionResult } from '../planning/planningExecutionGap';
import type { RecoveryModeResult } from '../recovery/trigger';
import type { RiskAssessment } from '../risk/riskAssessment';
import type { LocalDate } from '../util/date';

// LLM_LAYER_SPEC.md §2 -- the seven lenses emitted by the single nightly inference call.
export const LENS_NAMES = [
  'executive_coach',
  'academic_strategist',
  'behavior_analyst',
  'skeptic',
  'systems_engineer',
  'motivator',
  'recovery_coach',
] as const;

export type LensName = (typeof LENS_NAMES)[number];

export interface EvidenceClaim {
  claim: string;
  evidence: string[]; // must cite provided data points -- §3
  confidence: number; // 0..1
}

export interface AcademicRiskNote {
  course_id: string;
  note: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface Intervention {
  description: string;
  rationale: string;
}

/**
 * The model-enriched layer's output contract (LLM_LAYER_SPEC.md §3), now including the
 * full 7-lens `lenses` record from §2 (previously out of scope -- dailyAnalysisSchema.ts
 * carried a comment explaining why; now resolved).
 */
export interface DailyAnalysis {
  headline: string;
  objective_summary: string;
  wins: EvidenceClaim[];
  failures: EvidenceClaim[];
  planning_errors: EvidenceClaim[];
  behavior_patterns: EvidenceClaim[];
  academic_risks: AcademicRiskNote[];
  /** §3's core response type: `Record<LensName, string>`, no nullability. When Recovery
   *  Mode isn't flagged, `recovery_coach` is an empty string, not null or an omitted key
   *  -- the deterministic engine decides whether there's a crisis to coach through, and
   *  the model's own text (if it tried to declare one anyway) is discarded, not stored. */
  lenses: Record<LensName, string>;
  tomorrow_changes: Intervention[]; // "no more than three changes" -- §3/§4 rule 7
  kill_list_intervention: Intervention | null;
  // What it could NOT assess, and why -- a legitimate place to put "I couldn't judge
  // this" rather than fabricating a pattern to fill a required field (§3's own reasoning).
  data_gaps: string[];
}

export interface DeterministicNightlyReportCheckin {
  energy: number;
  mood: number;
  derailmentReason: string | null;
  capacityMinutes: number | null;
  floorMinutes: number | null;
  targetMinutes: number | null;
  recoveryModeTriggeredAtCheckin: boolean;
}

export interface DeterministicNightlyReportReview {
  mitsPlanned: number;
  mitsCompleted: number;
  deepWorkPlannedMin: number | null;
  deepWorkActualMin: number | null;
  screenTimeMin: number | null;
  distractingTimeMin: number | null;
  workoutCompleted: boolean | null;
  killListSuccessCount: number | null;
  killListTotal: number | null;
  proudText: string | null;
  wentWrongText: string | null;
  importantNoteText: string | null;
}

export interface KillHabitBounceBack {
  killHabitId: number;
  name: string;
  bounceBack: BounceBackResult;
  eventsToday: number;
  relapsesToday: number;
}

export interface DeterministicNightlyReport {
  localDate: LocalDate;
  dataGaps: string[];
  /** A short, generated-from-data headline and 2-3 sentence summary -- produced with
   *  zero model involvement (assembleReport.ts), so the report opens with real prose on
   *  every night, not just the nights the model layer ran. */
  headline: string;
  objectiveSummary: string;

  checkin: DeterministicNightlyReportCheckin | null;
  review: DeterministicNightlyReportReview | null;

  recoveryMode: RecoveryModeResult;
  planningExecution: PlanningExecutionResult | null;

  gradeProjections: CourseGradeProjection[];
  riskAssessment: RiskAssessment;

  frictionToday: FrictionDistribution;
  /** This week (the 7 days ending on localDate) vs the 7 days before that. */
  frictionTrend: CauseTrendEntry[];

  killLoop: KillHabitBounceBack[];

  focusSessions: {
    count: number;
    completedCount: number;
    abandonedCount: number;
    totalActualMin: number;
    totalInterruptions: number;
  };
}

export interface NightlyAgentReportPayload {
  deterministic: DeterministicNightlyReport;
  analysis: DailyAnalysis | null;
  /** Present exactly when analysis is null -- why the model layer didn't produce a
   *  result. Never silently absent when analysis is missing. */
  note: string | null;
}
