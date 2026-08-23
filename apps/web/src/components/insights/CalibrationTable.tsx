import type { CalibrationTableRow } from "@collegeos/api";

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

/** The personal multiplier per task category (DOMAIN_ENGINE_SPEC.md §3), grouped by the
 *  same confidence tiers as everything else on this screen -- a `low`/`insufficient`
 *  multiplier is a hypothesis about that category, not a measured fact yet. */
export function CalibrationTable({ rows }: { rows: CalibrationTableRow[] }) {
  if (rows.length === 0) {
    return <p className="text-body-s text-ink-muted">No completed sessions yet to calibrate against.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse">
        <thead>
          <tr className="border-b border-hairline text-left font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            <th className="py-2 pr-4 font-normal">Category</th>
            <th className="py-2 pr-4 font-normal">Multiplier</th>
            <th className="py-2 pr-4 font-normal">Confidence</th>
            <th className="py-2 pr-4 font-normal">Sample</th>
            <th className="py-2 pr-4 font-normal">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ category, result }) => (
            <tr key={category} className="border-b border-hairline last:border-b-0">
              <td className="py-3 pr-4 text-body-s text-ink">{categoryLabel(category)}</td>
              <td className="py-3 pr-4 font-mono text-body-s tabular-nums text-ink">×{result.multiplier.toFixed(2)}</td>
              <td className="py-3 pr-4 font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">{result.confidence}</td>
              <td className="py-3 pr-4 font-mono text-body-s tabular-nums text-ink-muted">{Math.round(result.effectiveSampleSize)}</td>
              <td className="py-3 pr-4 font-mono text-caption text-ink-faint">
                {result.source === "category" ? "this category" : result.source === "global" ? "your overall average" : "none — default 1.0×"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
