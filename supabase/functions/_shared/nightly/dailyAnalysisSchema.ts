// The model-enriched layer's output contract -- LLM_LAYER_SPEC.md §3. This is checked
// with Zod AFTER the forced-tool-use response comes back; the JSON Schema sent in the
// request is a strong prior, never the actual gate (§3's own framing).
//
// Scoped to the core contract for tonight (headline/summary/wins/failures/planning
// errors/behavior patterns/academic risks/tomorrow's changes/kill-list
// intervention/data gaps) -- the full 7-lens `lenses` record (§2) is real scope but adds
// meaningful prompt/schema surface for something that can't be exercised against a real
// model in this environment anyway (no ANTHROPIC_API_KEY, same constraint as L5).
// Flagged as a follow-up, not silently dropped.

import { z } from "zod";

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

export const DailyAnalysisSchema = z.object({
  headline: z.string().min(1),
  objective_summary: z.string().min(1),
  wins: z.array(EvidenceClaimSchema),
  failures: z.array(EvidenceClaimSchema),
  planning_errors: z.array(EvidenceClaimSchema),
  behavior_patterns: z.array(EvidenceClaimSchema),
  academic_risks: z.array(AcademicRiskNoteSchema),
  tomorrow_changes: z.array(InterventionSchema).max(3), // "no more than three changes" -- §3/§4 rule 7
  kill_list_intervention: InterventionSchema.nullable(),
  // What it could NOT assess, and why -- a legitimate place to put "I couldn't judge
  // this" rather than fabricating a pattern to fill a required field (§3's own reasoning).
  data_gaps: z.array(z.string()),
});

export type DailyAnalysis = z.infer<typeof DailyAnalysisSchema>;
