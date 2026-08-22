import type { RiskBand } from './assignmentRisk';
import type { DeliverableRisk } from './riskAssessment';

/**
 * The single risk band that characterises a whole day.
 *
 * WHY THIS EXISTS AS A CORE FUNCTION, and not as two lines inside a component:
 * `RiskAssessment` is per-deliverable and per-course. There has never been a day-level band.
 * DESIGN_LANGUAGE_V2 §6 introduces one consumer for it — the ambient Aurora field — and the
 * temptation is to write `Math.max(...)` inline in a UI component. That would be a domain
 * calculation living in a shell, which this codebase forbids (CLAUDE.md, law 2: deterministic
 * code calculates, the surface only interprets). It would also mean web and mobile could
 * silently derive the *same* day differently.
 *
 * So: one definition, here, unit-tested, imported by both platforms.
 */

/** Ordered low → critical, matching `riskBands` in packages/design. Index is the severity rank. */
const BAND_ORDER: readonly RiskBand[] = ['low', 'moderate', 'high', 'critical'];

/**
 * The day's band is **the highest band among the deliverables in play** — nothing else.
 *
 * Deliberately a maximum rather than an average or a weighted blend. A day holding one critical
 * deliverable and nine low ones is a critical day; averaging would report it as calm, which is
 * precisely the kind of comfortable-but-false reading this product exists to argue with.
 *
 * Deliberately NOT folded together with recovery mode, workload, or capacity. Those are real
 * signals about the *person*, not about deadline exposure, and each already has its own surface
 * (the recovery banner, the workload band). Blending them here would produce a number that means
 * two things at once and can therefore be honestly explained as neither.
 *
 * Returns **`null` for an empty list**, and that is the load-bearing case: a brand-new account has
 * no deliverables, so it has no computed risk, so it gets no atmosphere at all — flat ground. The
 * Aurora is an instrument reading. An account with nothing to read renders nothing. Never
 * substitute a default band to make a screen look alive.
 */
export function deriveDayBand(deliverableRisks: readonly DeliverableRisk[]): RiskBand | null {
  let rank = -1;
  for (const risk of deliverableRisks) {
    const candidate = BAND_ORDER.indexOf(risk.result.band);
    if (candidate > rank) rank = candidate;
  }
  return rank === -1 ? null : (BAND_ORDER[rank] as RiskBand);
}
