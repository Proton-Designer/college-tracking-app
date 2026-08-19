/**
 * Renders a risk engine's TraceEntry[] (packages/core, DOMAIN_ENGINE_SPEC.md §1) into the
 * plain-language "Why:" lines the doc's own example uses ("Exam worth 22% in 9 days"). This is
 * presentation only — every number here is read straight off the trace, nothing is recomputed.
 *
 * Kept byte-for-byte in sync with apps/web/src/lib/riskExplain.ts — no RN/DOM dependency here,
 * so a future consolidation into a shared package is a pure move, not a rewrite.
 */

interface TraceEntryLike {
  key: string;
  rawInput: unknown;
  normalized: number;
  weight: number;
  contribution: number;
}

function explainOne(entry: TraceEntryLike): string | null {
  const raw = entry.rawInput as Record<string, unknown> | number | null;

  switch (entry.key) {
    case "weight": {
      const pct = raw as number;
      return `Worth ${pct}% of the grade`;
    }
    case "difficulty": {
      if (raw == null) return null;
      return `Rated ${raw}/5 difficulty`;
    }
    case "knowledgeGap": {
      if (raw == null) return null;
      return `You rate understanding ${raw}/5`;
    }
    case "unfinished": {
      const r = raw as { completedUnits: number; plannedUnits: number };
      if (r.plannedUnits === 0) return "Nothing planned yet";
      return `${r.completedUnits} of ${r.plannedUnits} planned sessions completed`;
    }
    case "congestion": {
      const r = raw as { committedHours: number; availableHours: number };
      if (r.availableHours <= 0) return null;
      return `${r.committedHours.toFixed(1)} of ${r.availableHours.toFixed(1)} available hours already committed`;
    }
    case "procrastination": {
      const r = raw as { userMeanStartDelayDays: number | null; sampleSize: number; globalMeanStartDelayDays: number };
      if (r.userMeanStartDelayDays != null && r.sampleSize >= 5) {
        return `Historically starts ${r.userMeanStartDelayDays.toFixed(1)} days late`;
      }
      return `Starts ~${r.globalMeanStartDelayDays.toFixed(1)} days late on average (not enough personal history yet)`;
    }
    case "gradeHeadroom": {
      const r = raw as { targetPct: number | null; projectedPct: number | null };
      if (r.targetPct == null || r.projectedPct == null) return null;
      const gap = r.targetPct - r.projectedPct;
      if (gap <= 0) return `Projected grade already meets the ${r.targetPct}% target`;
      return `Projected grade is ${gap.toFixed(1)} pts short of the ${r.targetPct}% target`;
    }
    default:
      return null;
  }
}

/** Top N trace entries by contribution, rendered as plain-language lines. Excluded/zero-weight
 *  factors are skipped, and so is `proximity` — every current call site already shows a due-date
 *  label (daysRemainingLabel) right next to where this runs, so restating "past due"/"due in N
 *  days" here would just duplicate it rather than add a new reason. */
export function explainTopFactors(trace: TraceEntryLike[], limit = 3): string[] {
  return trace
    .filter((entry) => entry.weight > 0 && entry.key !== "proximity")
    .sort((a, b) => b.contribution - a.contribution)
    .map(explainOne)
    .filter((line): line is string => line != null)
    .slice(0, limit);
}
