import type { BackplanChain as BackplanChainData } from "@/lib/loadBackplanChains";

function phaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

/** The backplan's milestone chain for one deliverable — expanded inline, not collapsed,
 *  per SCREEN_SPEC: a compressed plan is flagged, an infeasible one is unmissable. */
export function BackplanChain({ chain }: { chain: BackplanChainData | undefined }) {
  if (!chain) return null;
  const { backplan, milestones } = chain;

  return (
    <div className="mt-1 flex flex-col gap-1">
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
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-caption">
          {milestones.map((m) => (
            <li key={m.id} className={m.completed ? "text-ink-faint line-through" : "text-ink-muted"}>
              {phaseLabel(m.phase)} · {m.milestone_date} · {m.minutes}m
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
