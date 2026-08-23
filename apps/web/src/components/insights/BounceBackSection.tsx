import type { HabitBounceBack } from "@/app/(app)/insights/data";

const TREND_GLYPH: Record<string, string> = { improving: "↓", worsening: "↑", stable: "→", insufficient: "" };

/** SCREEN_SPEC §7 — bounce-back score with trend, one row per active kill habit.
 *  DOMAIN_ENGINE_SPEC.md §5: time-to-recovery, not a streak -- a lower recovery time is
 *  the improvement, hence the trend glyph reads inverted from a naive "up is good". */
export function BounceBackSection({ items }: { items: HabitBounceBack[] }) {
  if (items.length === 0) {
    return <p className="text-body-s text-ink-muted">No active kill-list commitments yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ habit, result }) => (
        <li key={habit.id} className="flex items-center justify-between gap-4 border-b border-hairline py-3 last:border-b-0">
          <span className="text-body text-ink">{habit.name}</span>
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-metric tabular-nums text-ink">{result.confidence === "insufficient" ? "—" : result.score}</span>
            <span className="font-mono text-caption tabular-nums text-ink-faint">
              {result.confidence === "insufficient"
                ? "not enough recovered lapses yet"
                : `${result.trend} ${TREND_GLYPH[result.trend]}`.trim()}
              {result.ongoingLapseDays > 0 ? ` · ${result.ongoingLapseDays}d ongoing lapse` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
