import type { Course } from "@collegeos/api";
import type { DayView } from "@collegeos/api";
import { daysBetween } from "@collegeos/core";
import { RiskPill } from "@/components/ui/RiskPill";
import { daysRemainingLabel } from "@/lib/dates";
import { explainTopFactors } from "@/lib/riskExplain";

export function DeadlineRadar({
  today,
  deliverables,
  deliverableRisks,
  courses,
}: {
  today: string;
  deliverables: DayView["upcomingDeliverables"];
  deliverableRisks: DayView["risk"]["deliverableRisks"];
  courses: Record<number, Course>;
}) {
  const riskByDeliverable = new Map(deliverableRisks.map((r) => [r.deliverableId, r]));

  const top5 = [...deliverables]
    .sort((a, b) => daysBetween(today, a.localDueDate) - daysBetween(today, b.localDueDate))
    .slice(0, 5);

  if (top5.length === 0) {
    return <p className="text-body text-ink-muted">Nothing on the horizon in the next two weeks.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {top5.map((d) => {
        const risk = riskByDeliverable.get(d.id);
        const course = courses[d.courseId];
        const showReason = risk && (risk.result.band === "high" || risk.result.band === "critical");
        const reasons = showReason ? explainTopFactors(risk.result.trace, 1) : [];

        return (
          <li key={d.id} className="flex flex-col gap-1 border-b border-hairline pb-4 last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-body text-ink">{d.title}</span>
                <span className="font-mono text-caption text-ink-faint">
                  {course?.code ?? "—"} · {daysRemainingLabel(today, d.localDueDate)}
                </span>
              </div>
              {risk ? <RiskPill band={risk.result.band} label={risk.result.band.toUpperCase()} /> : null}
            </div>
            {reasons.length > 0 ? (
              <p className="text-body-s text-ink-muted">{reasons[0]}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
