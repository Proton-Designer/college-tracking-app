import type { WeekReview as WeekReviewResult } from "@collegeos/core";
import { EmptyState, Panel } from "@/components/ui";

export interface WeekReviewProps {
  review: WeekReviewResult;
  fromDate: string;
  toDate: string;
}

function formatDay(localDate: string): string {
  // Parsed as a local wall-clock date. `new Date("2026-08-27")` reads as UTC midnight and
  // renders the previous day west of Greenwich (B4).
  const [y, m, d] = localDate.split("-").map(Number);
  if (y == null || m == null || d == null) return localDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The Sunday Review, web port. Every number here is computed by core's `computeWeekReview`
 * and this component only formats it — no totals, shares or ordering are derived in the
 * view, so the web and mobile reviews cannot disagree about the same week.
 */
export function WeekReview({ review, fromDate, toDate }: WeekReviewProps) {
  if (review.totalMinutes === 0 && review.totalDistractions === 0) {
    return (
      <EmptyState
        title="Nothing logged this week"
        description="The review reads from completed Hours and the distraction taps inside them. Finish an Hour and it starts filling in."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {formatDay(fromDate)} – {formatDay(toDate)}
        </p>
        <p className="font-mono text-label tabular-nums text-ink-muted">
          {review.totalHours} {review.totalHours === 1 ? "Hour" : "Hours"} · {formatHours(review.totalMinutes)}
        </p>
      </div>

      <Panel title="Where the Hours went" className="flex flex-col gap-3">
        {review.hoursByCategory.length === 0 ? (
          <p className="text-body-s text-ink-muted">No completed Hours this week.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {review.hoursByCategory.map((row) => (
              <li key={row.category} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body text-ink">{row.category}</span>
                  <span className="font-mono text-label tabular-nums text-ink-muted">
                    {formatHours(row.minutes)} · {Math.round(row.share * 100)}%
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-hairline" aria-hidden="true">
                  <div className="h-1 rounded-full bg-accent" style={{ width: `${Math.round(row.share * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="What broke the Hours" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          Ordered by frequency. The point is the top one or two — a Pareto, not a scoreboard.
        </p>
        {review.distractionPareto.length === 0 ? (
          <p className="text-body-s text-ink-muted">No distractions logged this week.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {review.distractionPareto.map((row) => (
              <li key={row.cause} className="flex items-baseline justify-between gap-3">
                <span className="text-body text-ink">{row.cause}</span>
                <span className="font-mono text-label tabular-nums text-ink-muted">
                  {row.count} · {Math.round(row.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {review.totalDistractions} total
        </p>
      </Panel>

      <Panel title="Efficiency by day" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          A day that was never closed has no denominator, so it reads &ldquo;not closed&rdquo; rather than
          a number. Scoring an unfinished day against the current time would be arithmetic wearing the
          costume of a fact.
        </p>
        <ul className="flex flex-col gap-2">
          {review.efficiencyByDay.map((day) => (
            <li key={day.localDate} className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-label uppercase tracking-[0.1em] text-ink">
                {formatDay(day.localDate)}
              </span>
              <span className="font-mono text-label tabular-nums text-ink-muted">
                {day.ratio == null ? "not closed" : `${Math.round(day.ratio * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
