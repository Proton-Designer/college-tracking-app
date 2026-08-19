import type { NightlyAgentReportPayload } from '@collegeos/core';

/**
 * TypeScript shape of `agent_reports.payload` for `report_type = 'nightly'` -- a plain
 * jsonb column, so the generated DB types carry no structure for it. The actual shape
 * (`DailyAnalysis`, `DeterministicNightlyReport`, `NightlyAgentReportPayload`) is now
 * defined once, in `packages/core/src/reports/nightlyReportTypes.ts` -- this file used
 * to hand-declare its own copy, which was a real drift risk (the edge function and this
 * package each maintaining an independently-consistent-but-possibly-different shape).
 * `packages/core` is already mirrored into `supabase/functions/_shared/core/` and that
 * mirror is already guarded by `check:core-mirror`, so importing from it here closes the
 * gap with no new mechanism. This is a type describing already-validated data (the edge
 * function Zod-validates the model's output before writing it; this package never
 * re-derives or re-validates any of it), not a second implementation of anything that
 * computes.
 */
export type { DailyAnalysis, DeterministicNightlyReport, NightlyAgentReportPayload } from '@collegeos/core';
export type {
  AcademicRiskNote,
  DeterministicNightlyReportCheckin,
  DeterministicNightlyReportReview,
  EvidenceClaim,
  Intervention,
  KillHabitBounceBack,
  LensName,
} from '@collegeos/core';
export { LENS_NAMES } from '@collegeos/core';

/** `payload` is a plain jsonb column with no generated structure -- this is a type
 *  assertion, not re-validation. Safe because the only writer is our own edge function,
 *  which Zod-validates any model output before it's ever stored (LLM_LAYER_SPEC.md §3's
 *  actual gate); re-validating trusted first-party data on every read would just
 *  duplicate that gate for no benefit. Returns null only if the row is missing the
 *  `deterministic` key entirely -- a malformed row, not a valid-but-empty one. */
export function parseNightlyReportPayload(payload: unknown): NightlyAgentReportPayload | null {
  if (payload == null || typeof payload !== 'object' || !('deterministic' in payload)) return null;
  return payload as NightlyAgentReportPayload;
}
