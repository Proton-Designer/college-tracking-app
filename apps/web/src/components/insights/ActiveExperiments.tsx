import { daysBetween } from "@collegeos/core";
import type { ActiveExperiment } from "@/app/(app)/insights/data";
import { Panel } from "@/components/ui";

function meanBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((sum, item) => sum + value(item), 0) / items.length;
}

/** SCREEN_SPEC §7 — "days elapsed, measures being tracked, and current direction —
 *  explicitly labeled provisional until complete." There's no stored baseline or
 *  hypothesized direction on `experiments` (only hypothesis/protocol text), so
 *  computeExperimentOutcome (which needs both) can't run here -- rather than fabricate a
 *  baseline, this shows the trial's own first-half-vs-second-half movement, labeled "so
 *  far" rather than a verdict against anything. Flagged to the Lead as a real spec gap. */
export function ActiveExperiments({ experiments, today }: { experiments: ActiveExperiment[]; today: string }) {
  if (experiments.length === 0) {
    return <p className="text-body-s text-ink-faint">No experiments running right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {experiments.map(({ experiment, measurements }) => {
        const elapsedDays = daysBetween(experiment.start_date, today);
        const totalDays = experiment.end_date ? daysBetween(experiment.start_date, experiment.end_date) : null;
        const metrics = [...new Set(measurements.map((m) => m.metric))];

        const sorted = [...measurements].sort((a, b) => a.local_date.localeCompare(b.local_date));
        const mid = Math.floor(sorted.length / 2);
        const soFar =
          sorted.length >= 4
            ? { first: meanBy(sorted.slice(0, mid), (m) => m.value), second: meanBy(sorted.slice(mid), (m) => m.value) }
            : null;

        return (
          <li key={experiment.id}>
            <Panel className="flex flex-col gap-2">
              <p className="text-body text-ink">{experiment.hypothesis}</p>
              <p className="font-mono text-caption tabular-nums text-ink-faint">
                Day {elapsedDays}
                {totalDays != null ? ` of ${totalDays}` : ""} · {metrics.length > 0 ? metrics.join(", ") : "no measurements logged yet"}
              </p>
              {soFar ? (
                <p className="text-body-s text-ink-muted">
                  So far: {soFar.first.toFixed(1)} → {soFar.second.toFixed(1)} ({sorted.length} measurements — still provisional)
                </p>
              ) : null}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
