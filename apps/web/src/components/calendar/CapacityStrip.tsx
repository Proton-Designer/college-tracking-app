import type { DayCapacity } from "@collegeos/core";
import { fmtMinutes } from "@/lib/formatMinutes";

function weekdayLabel(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}

/** Uncommitted minutes per day over the near horizon — deliberately just the number the
 *  engine already computed (waking minutes minus committed calendar time), not a
 *  committed-vs-total bar, since the total isn't exposed here to derive one honestly.
 *
 *  The numbers cluster tightly (typically ~12h-17h), so a tall solid bar chart exaggerates
 *  a flat, low-information range into the visually dominant element on the page. The
 *  number is the actual content; the bar is now a minor underline-style indicator beneath
 *  it, not the other way around. */
export function CapacityStrip({ days }: { days: DayCapacity[] }) {
  if (days.length === 0) return null;
  const maxMinutes = Math.max(...days.map((d) => d.availableMinutes), 1);

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {days.map((d) => (
        <div key={d.date} className="flex w-14 shrink-0 flex-col items-center gap-1">
          <span className="font-mono text-caption text-ink-faint">{weekdayLabel(d.date)}</span>
          <span className="font-mono text-caption tabular-nums text-ink">{fmtMinutes(d.availableMinutes)}</span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-accent/50" style={{ width: `${Math.max(8, (d.availableMinutes / maxMinutes) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
