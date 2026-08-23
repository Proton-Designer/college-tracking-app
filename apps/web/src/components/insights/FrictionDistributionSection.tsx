import type { CauseTrendEntry, FrictionDistribution } from "@collegeos/core";

function causeLabel(cause: string): string {
  return cause.replace(/_/g, " ");
}

const TREND_GLYPH: Record<CauseTrendEntry["direction"], string> = { up: "↑", down: "↓", stable: "→" };

/** SCREEN_SPEC §7 — friction cause distribution, pure counting per DOMAIN_ENGINE_SPEC.md
 *  §9: "what's actually failing and how often", diagnostic rather than judgmental. */
export function FrictionDistributionSection({
  distribution,
  trend,
}: {
  distribution: FrictionDistribution;
  trend: CauseTrendEntry[];
}) {
  if (distribution.totalCount === 0) {
    return <p className="text-body-s text-ink-muted">No friction logged in the last 30 days.</p>;
  }

  const trendByCause = new Map(trend.map((t) => [t.cause, t]));

  return (
    <ul className="flex flex-col gap-2">
      {distribution.entries.map((entry) => {
        const t = trendByCause.get(entry.cause);
        return (
          <li key={entry.cause} className="flex items-center justify-between gap-4 border-b border-hairline py-2 last:border-b-0">
            <span className="text-body-s text-ink">{causeLabel(entry.cause)}</span>
            <span className="font-mono text-body-s tabular-nums text-ink-muted">
              {entry.count} · {Math.round(entry.percentage)}%
              {t && t.direction !== "stable" ? (
                <span className="ml-2 text-ink-faint">
                  {TREND_GLYPH[t.direction]} {Math.abs(t.deltaPercentagePoints).toFixed(1)}pp vs prior 30d
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
