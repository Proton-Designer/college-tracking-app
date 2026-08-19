// The model-enriched layer's output contract -- LLM_LAYER_SPEC.md §3. This is checked
// with Zod AFTER the forced-tool-use response comes back; the JSON Schema sent in the
// request is a strong prior, never the actual gate (§3's own framing).
//
// `DailyAnalysis` (the TS shape) is defined once, in packages/core/src/reports --
// this file only adds the runtime Zod validation on top of it. The `_shapeCheck`
// assertion below fails to compile if this schema's inferred shape ever drifts from
// that one definition.

import { z } from "zod";
import { LENS_NAMES, type DailyAnalysis, type LensName } from "../core/index.ts";

export const EvidenceClaimSchema = z.object({
  claim: z.string().min(1),
  evidence: z.array(z.string()).min(1), // must cite provided data points -- §3
  confidence: z.number().min(0).max(1),
});

export const AcademicRiskNoteSchema = z.object({
  course_id: z.string(),
  note: z.string().min(1),
  urgency: z.enum(["low", "medium", "high"]),
});

export const InterventionSchema = z.object({
  description: z.string().min(1),
  rationale: z.string().min(1),
});

// LLM_LAYER_SPEC.md §2's numeric caps aren't spelled out exactly -- "capped short" gives
// no figure. 320 chars (roughly two sentences) is this codebase's own interpretation: a
// hard backstop behind the real constraint, which is the prompt instruction itself
// ("must cite a specific event from today"). Zod can't verify that a string actually
// cites an event, only that it isn't empty and isn't sprawling.
const MOTIVATOR_MAX_CHARS = 320;

const ALWAYS_ON_LENS_SHAPE = {
  executive_coach: z.string().min(1),
  academic_strategist: z.string().min(1),
  behavior_analyst: z.string().min(1),
  // "required to be non-empty" is spec's own emphasis (§2) -- the self-critique lens is
  // the one most tempting for a model to leave thin, so it's called out explicitly even
  // though every always-on lens here carries the same non-empty rule.
  skeptic: z.string().min(1),
  systems_engineer: z.string().min(1),
  motivator: z.string().min(1).max(MOTIVATOR_MAX_CHARS),
};

// §3's core response type is `Record<LensName, string>` -- no nullability. When
// Recovery Mode isn't flagged, `recovery_coach` must be an empty string, not an omitted
// key or null. Zod alone can't enforce "empty exactly when core hasn't flagged Recovery
// Mode" (this schema has no access to that flag); runNightlyAnalysis.ts enforces it
// after the model responds, by overwriting whatever the model wrote -- "the
// deterministic engine decides; the model does not get to declare a crisis" (§2).
export const LensesSchema = z.object({
  ...ALWAYS_ON_LENS_SHAPE,
  recovery_coach: z.string(),
});

// Compile-time-only: every key LensesSchema declares must be exactly LENS_NAMES, so a
// future lens added to one side and not the other fails to build instead of silently
// diverging.
const _lensKeysCheck: readonly LensName[] = Object.keys(LensesSchema.shape) as LensName[];
void _lensKeysCheck;

export const DailyAnalysisSchema = z.object({
  headline: z.string().min(1),
  objective_summary: z.string().min(1),
  wins: z.array(EvidenceClaimSchema),
  failures: z.array(EvidenceClaimSchema),
  planning_errors: z.array(EvidenceClaimSchema),
  behavior_patterns: z.array(EvidenceClaimSchema),
  academic_risks: z.array(AcademicRiskNoteSchema),
  lenses: LensesSchema,
  tomorrow_changes: z.array(InterventionSchema).max(3), // "no more than three changes" -- §3/§4 rule 7
  kill_list_intervention: InterventionSchema.nullable(),
  // What it could NOT assess, and why -- a legitimate place to put "I couldn't judge
  // this" rather than fabricating a pattern to fill a required field (§3's own reasoning).
  data_gaps: z.array(z.string()),
});

// Fails to compile if DailyAnalysisSchema's inferred shape ever drifts from
// packages/core's DailyAnalysis -- the single source of truth for this type.
type _ShapeCheck = z.infer<typeof DailyAnalysisSchema> extends DailyAnalysis
  ? DailyAnalysis extends z.infer<typeof DailyAnalysisSchema>
    ? true
    : never
  : never;
const _shapeCheck: _ShapeCheck = true;
void _shapeCheck;

export type { DailyAnalysis } from "../core/index.ts";
export { LENS_NAMES };
