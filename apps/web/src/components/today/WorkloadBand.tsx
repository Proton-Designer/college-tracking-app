import type { WorkloadLevels } from "@collegeos/core";

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function WorkloadBand({ workload }: { workload: WorkloadLevels }) {
  const { floorMinutes, targetMinutes, capacityMinutes, floorExceedsCapacity, stretchItems } = workload;
  const floorPct = capacityMinutes > 0 ? Math.min(100, (floorMinutes / capacityMinutes) * 100) : 0;
  const targetPct = capacityMinutes > 0 ? Math.min(100, (targetMinutes / capacityMinutes) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <div className="h-full bg-risk-critical" style={{ width: `${floorPct}%` }} />
        <div className="h-full bg-accent" style={{ width: `${Math.max(0, targetPct - floorPct)}%` }} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-body-s text-ink-muted">
        <span>
          <span className="text-label uppercase tracking-[0.1em] text-risk-critical">Floor</span>{" "}
          {fmtMinutes(floorMinutes)}
        </span>
        <span>
          <span className="text-label uppercase tracking-[0.1em] text-accent">Target</span>{" "}
          {fmtMinutes(targetMinutes)}
        </span>
        {stretchItems.length > 0 ? (
          <span>
            <span className="text-label uppercase tracking-[0.1em] text-ink-faint">Stretch</span>{" "}
            +{stretchItems.length} more if there's room
          </span>
        ) : null}
        <span className="text-ink-faint">of ~{fmtMinutes(capacityMinutes)} today</span>
      </div>
      {floorExceedsCapacity ? (
        <p className="text-body-s text-risk-critical">
          Floor alone exceeds today&apos;s realistic capacity — something non-negotiable won&apos;t
          fit without cutting something else.
        </p>
      ) : null}
    </div>
  );
}
