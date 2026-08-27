import type { BackplanChain as BackplanChainData } from "@collegeos/api";
import { formatShortDate } from "@/lib/dates";

function phaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

/** The backplan's milestone chain for one deliverable — expanded inline, not collapsed,
 *  per SCREEN_SPEC: a compressed plan is flagged, an infeasible one is unmissable. One row
 *  per phase (not a `·`-joined run-on) so phase / date / duration read as distinct fields. */
export function BackplanChain({ chain }: { chain: BackplanChainData | undefined }) {
  if (!chain) return null;
  const { backplan, milestones } = chain;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {backplan.infeasible ? (
        <p className="text-body-s text-risk-critical">
          Backplan infeasible — short {backplan.shortfall_minutes} min even with everything droppable dropped.
        </p>
      ) : backplan.compressed ? (
        <p className="text-body-s text-risk-high">
          Backplan compressed{backplan.dropped_phases.length > 0 ? ` — dropped: ${backplan.dropped_phases.map(phaseLabel).join(", ")}` : ""}.
        </p>
      ) : null}
      {milestones.length > 0 ? (
        <ol className="flex flex-col gap-0.5">
          {milestones.map((m) => (
            <li
              key={m.id}
              className={`flex items-baseline gap-3 font-mono text-caption ${m.completed ? "text-ink-faint line-through" : "text-ink-muted"}`}
            >
              <span className="w-28 shrink-0 capitalize">{phaseLabel(m.phase)}</span>
              <span className="w-14 shrink-0 tabular-nums">{formatShortDate(m.milestone_date)}</span>
              <span className="tabular-nums">{m.minutes}m</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
