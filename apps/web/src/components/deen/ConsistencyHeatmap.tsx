import { PRAYER_LABELS, type ConsistencyGrid, type EffectivePrayerStatus } from "@collegeos/core";
import { formatShortDate } from "@/lib/dates";

/**
 * The 30-day x 5 consistency grid — one of the four surfaces D30 kept when it dropped the
 * prayer streak. One row per prayer so a pattern in a single prayer (Fajr, always Fajr) is
 * visible across time, which is the orientation `buildConsistencyGrid` already returns.
 *
 * **Colour never carries the meaning on its own.** Every cell has a `title` and an
 * `aria-label` naming the prayer, the date and the status in words, and the legend below
 * names all five states. The colour is a second encoding of something already stated, not
 * the only encoding — which also keeps this readable for anyone who can't tell the amber
 * from the grey.
 *
 * **Missed is grey, not red.** A miss is stated plainly and paired with the way back (the
 * qada backlog above); the heatmap is not the place to shout at someone about it.
 */

const CELL_CLASS: Record<EffectivePrayerStatus, string> = {
  on_time: "bg-domain-deen",
  // The same hue at partial strength: made up is the same prayer, later.
  qada: "bg-domain-deen/45",
  missed: "bg-ink-faint",
  pending: "bg-surface-sunken",
  upcoming: "border border-hairline",
};

const STATUS_WORDS: Record<EffectivePrayerStatus, string> = {
  on_time: "On time",
  qada: "Made up",
  missed: "Missed",
  pending: "Not recorded",
  upcoming: "Still to come",
};

/** `pending` reads differently depending on WHY nothing resolved: with no location we cannot
 *  know, rather than the window merely being open. D40 — the label has to say which. */
function statusWord(status: EffectivePrayerStatus, hasLocation: boolean): string {
  if (status === "pending" && !hasLocation) return "Awaiting a time";
  return STATUS_WORDS[status];
}

const LEGEND_ORDER: EffectivePrayerStatus[] = ["on_time", "qada", "missed", "pending", "upcoming"];

export function ConsistencyHeatmap({ grid, hasLocation }: { grid: ConsistencyGrid; hasLocation: boolean }) {
  const columns = `minmax(3.5rem, auto) repeat(${grid.dates.length}, minmax(0, 1fr))`;
  const firstDate = grid.dates[0];
  const lastDate = grid.dates.at(-1);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[28rem] gap-1" style={{ display: "grid", gridTemplateColumns: columns }}>
          {grid.rows.map((row) => (
            <div key={row.prayer} className="contents">
              <span className="pr-2 font-mono text-caption uppercase tracking-[0.1em] text-ink-muted">
                {PRAYER_LABELS[row.prayer]}
              </span>
              {row.cells.map((cell, index) => {
                const date = grid.dates[index] ?? "";
                const description = `${PRAYER_LABELS[row.prayer]} · ${formatShortDate(date)} · ${statusWord(cell, hasLocation)}`;
                return (
                  <span
                    key={date}
                    title={description}
                    aria-label={description}
                    role="img"
                    className={`h-4 rounded-[3px] ${CELL_CLASS[cell]}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {firstDate && lastDate ? (
        <div className="flex justify-between font-mono text-caption text-ink-faint">
          <span>{formatShortDate(firstDate)}</span>
          <span>{formatShortDate(lastDate)}</span>
        </div>
      ) : null}

      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {LEGEND_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span aria-hidden className={`size-3 rounded-[3px] ${CELL_CLASS[status]}`} />
            <span className="text-caption text-ink-muted">{statusWord(status, hasLocation)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
