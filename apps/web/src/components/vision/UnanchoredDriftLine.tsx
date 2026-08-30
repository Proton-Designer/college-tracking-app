import Link from "next/link";
import type { UnanchoredReport } from "@collegeos/core";
import { Panel } from "@/components/ui";

/**
 * The drift line on the Sunday review (D48).
 *
 * **A fact, not a verdict.** The sentence is composed by `packages/core`'s `driftLine`, so mobile
 * says it identically, and it is rendered in ordinary ink — no risk colour, no warning icon, no
 * badge, no threshold at which it changes tone. There is no score anywhere in this component and
 * there must not be one: the count means something only next to the items, and the items are
 * listed.
 *
 * **Empty is empty, not zero.** A week with no MITs planned gets `null` from core and says so;
 * writing "0 unanchored" over a week nobody planned would be a fabricated observation (D40).
 */
export interface UnanchoredDriftLineProps {
  report: UnanchoredReport;
  /** The sentence, already composed in core. Null when the window held nothing to trace. */
  line: string | null;
}

export function UnanchoredDriftLine({ report, line }: UnanchoredDriftLineProps) {
  return (
    <Panel title="What the week's MITs connected to" className="flex flex-col gap-3">
      {line == null ? (
        <p className="text-body-s text-ink-muted">
          No MITs were planned this week, so there is nothing to trace yet.
        </p>
      ) : (
        <p className="text-body text-ink">{line}</p>
      )}

      {report.items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1">
            {report.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-[12rem] flex-1 text-body-s text-ink">{item.title}</span>
                <span className="font-mono text-label tabular-nums text-ink-muted">{item.date}</span>
              </li>
            ))}
          </ul>
          <p className="text-body-s text-ink-muted">
            Sometimes the honest answer is that the chain is wrong rather than the night.{" "}
            <Link href="/vision" className="text-accent underline underline-offset-2">
              The chain
            </Link>{" "}
            is where either one gets changed.
          </p>
        </>
      ) : null}
    </Panel>
  );
}
