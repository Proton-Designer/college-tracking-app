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
  const floorEqualsTarget = floorMinutes === targetMinutes;

  return (
    <div className="flex flex-col gap-3">
      {/* Floor/Target are both the user's own commitment level, not a danger reading — accent
          throughout. Floor exceeding capacity is a genuine severity condition, and only then
          does the bar switch to a risk color (DESIGN_SYSTEM §2: severity colors never mark
          the default state of something that isn't a problem). */}
      <div className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-sunken">
        <div className={floorExceedsCapacity ? "h-full bg-risk-critical" : "h-full bg-accent"} style={{ width: `${floorPct}%` }} />
        {!floorExceedsCapacity ? (
          <div className="h-full bg-accent/45" style={{ width: `${Math.max(0, targetPct - floorPct)}%` }} />
        ) : null}
      </div>

      <p className="font-mono text-body-s text-ink-muted">
        {floorEqualsTarget ? (
          <>
            <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Floor = target</span>{" "}
            {fmtMinutes(floorMinutes)}
          </>
        ) : (
          <>
            <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Floor</span> {fmtMinutes(floorMinutes)}
            {"  ·  "}
            <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Target</span> {fmtMinutes(targetMinutes)}
          </>
        )}
        <span className="text-ink-faint"> of ~{fmtMinutes(capacityMinutes)} realistic today.</span>
      </p>

      {stretchItems.length > 0 ? (
        <p className="font-mono text-body-s text-ink-faint">
          +{stretchItems.length} more {stretchItems.length === 1 ? "task" : "tasks"} if there&apos;s time left over.
        </p>
      ) : null}

      {floorExceedsCapacity ? (
        <p className="text-body-s text-risk-critical">
          Floor alone exceeds today&apos;s realistic capacity — something non-negotiable won&apos;t
          fit without cutting something else.
        </p>
      ) : null}
    </div>
  );
}
