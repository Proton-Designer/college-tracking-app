import type { DayCapacity } from "@collegeos/core";
import { fmtMinutes } from "@/lib/formatMinutes";

function weekdayLabel(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}

/** Available minutes per day over the near horizon — deliberately just the number the
 *  engine already computed (waking minutes minus committed calendar time), not a
 *  committed-vs-total bar, since the total isn't exposed here to derive one honestly. */
export function CapacityStrip({ days }: { days: DayCapacity[] }) {
  if (days.length === 0) return null;
  const maxMinutes = Math.max(...days.map((d) => d.availableMinutes), 1);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((d) => (
        <div key={d.date} className="flex w-14 shrink-0 flex-col items-center gap-1">
          <div className="flex h-16 w-full items-end rounded-sm bg-surface-sunken">
            <div
              className="w-full rounded-sm bg-accent"
              style={{ height: `${Math.max(4, (d.availableMinutes / maxMinutes) * 100)}%` }}
            />
          </div>
          <span className="font-mono text-caption text-ink-faint">{weekdayLabel(d.date)}</span>
          <span className="font-mono text-caption tabular-nums text-ink-muted">{fmtMinutes(d.availableMinutes)}</span>
        </div>
      ))}
    </div>
  );
}
