// The model-enriched weekly layer's output contract. LLM_LAYER_SPEC.md §5 covers the
// nightly call in detail; the weekly structure comes from the brief's own section list
// (docs/context/SOURCE_BRIEF.txt ~line 2060): OUTCOMES, PLAN ACCURACY, ACADEMICS,
// BEHAVIOR, HEALTH, KILL LIST, SYSTEM FAILURE, EXPERIMENT.
//
// The deterministic WeeklySynthesisPayload (summaryPyramid.ts) already computes
// OUTCOMES/PLAN ACCURACY/ACADEMICS/BEHAVIOR/KILL LIST as real numbers -- this schema is
// scoped to what genuinely needs model judgment on top of those numbers: narrative
// interpretation, HEALTH (no deterministic health-pattern computation exists yet -- an
// honest scope gap, not silently dropped), SYSTEM FAILURE (the brief's own framing:
// "important and easy to skip" -- deliberately not left to a code heuristic beyond the
// one deterministic signal WeeklySynthesisPayload.systemFailureSignals already provides),
// and EXPERIMENT (selecting what to try next is exactly the "model never chooses what
// matters" judgment call the deterministic pass leaves null).

import { z } from "zod";
import { EvidenceClaimSchema } from "./dailyAnalysisSchema.ts";

export const ProposedExperimentSchema = z.object({
  hypothesis: z.string().min(1),
  protocol: z.string().min(1),
  rationale: z.string().min(1),
});

export const WeeklyAnalysisSchema = z.object({
  headline: z.string().min(1),
  objective_summary: z.string().min(1),
  plan_accuracy_note: z.string().min(1),
  academic_note: z.string().min(1),
  behavior_note: z.string().min(1),
  health_note: z.string().min(1),
  /** What about CollegeOS itself isn't working this week -- the brief's own example:
   *  "Morning question #7 has produced no actionable insight for four weeks. Remove it." */
  system_failure: z.array(EvidenceClaimSchema),
  /** Null when the model judges the current experiment (if any) should keep running
   *  rather than being replaced -- not every week needs a new one. */
  proposed_experiment: ProposedExperimentSchema.nullable(),
  data_gaps: z.array(z.string()),
});

export type WeeklyAnalysis = z.infer<typeof WeeklyAnalysisSchema>;
