import type { DeliverableRisk } from "@collegeos/api";
import { RiskPill } from "@/components/ui";
import { daysRemainingLabel } from "@/lib/dates";
import { explainMissingFactors, explainTopFactors } from "@/lib/riskExplain";

/** The "Why:" list from the brief — the full explanation trace as evidence, not a debug view. */
export function CourseRiskPanel({ deliverableRisks, today }: { deliverableRisks: DeliverableRisk[]; today: string }) {
  if (deliverableRisks.length === 0) {
    return <p className="text-body-s text-ink-muted">Nothing open in this course right now.</p>;
  }

  const sorted = [...deliverableRisks].sort((a, b) => b.result.score - a.result.score);

  return (
    <ul className="flex flex-col gap-5">
      {sorted.map((dr) => {
        const reasons = explainTopFactors(dr.result.trace, 8);
        const caveats = explainMissingFactors(dr.result.missingFactors);
        return (
          <li key={dr.deliverableId} className="flex flex-col gap-2 border-b border-hairline pb-5 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body text-ink">{dr.title}</span>
                <span className="font-mono text-caption text-ink-faint">{daysRemainingLabel(today, dr.input.dueDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <RiskPill band={dr.result.band} label={dr.result.band.toUpperCase()} />
                <span className="font-mono text-body-s tabular-nums text-ink-muted">{dr.result.score}</span>
              </div>
            </div>
            {reasons.length > 0 ? (
              <ul className="flex flex-col gap-0.5 pl-3">
                {reasons.map((reason) => (
                  <li key={reason} className="text-body-s text-ink-muted before:mr-2 before:content-['·']">
                    {reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {caveats.length > 0 ? (
              <ul className="flex flex-col gap-0.5 pl-3">
                {caveats.map((caveat) => (
                  <li key={caveat} className="font-mono text-caption text-ink-faint">
                    {caveat}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
