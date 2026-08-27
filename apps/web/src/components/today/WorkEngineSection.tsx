import Link from "next/link";
import type { DayRow, TaskSessionRow } from "@collegeos/api";
import { Button, Panel } from "@/components/ui";

/**
 * The Work Engine's entry point on Today, mirroring mobile's `WorkEngineSection`.
 *
 * These surfaces are deliberately NOT in the primary nav on either platform. Mobile has
 * four tabs and reaches all of this from here; the web island tops out at six items and
 * would stop being a dock at thirteen. Keeping the two platforms on the same information
 * architecture is the point — a user who learns the app on their phone should not have to
 * relearn where things live on a laptop.
 */
const LINKS: [label: string, href: string][] = [
  ["Wall", "/wall"],
  ["Night Plan", "/nightplan"],
  ["Cards", "/cards"],
  ["Habits", "/habits"],
  ["Worries", "/worries"],
  ["Goals", "/goals"],
  ["Baselines", "/baselines"],
  ["Week", "/week"],
];

export interface WorkEngineSectionProps {
  day: DayRow | null;
  activeHour: TaskSessionRow | null;
  hoursToday: number;
  /** Derived by core's `isDayWon` against this weekday's baseline, never stored — a
   *  computed verdict must not become a column that can drift from its inputs. */
  dayWon: boolean;
}

export function WorkEngineSection({ day, activeHour, hoursToday, dayWon }: WorkEngineSectionProps) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Work Engine</h2>
        <span className="font-mono text-label tabular-nums text-ink-muted">
          {hoursToday} of {day?.baseline_hours ?? 0} {day?.baseline_hours === 1 ? "Hour" : "Hours"}
          {dayWon ? " · day won" : ""}
        </span>
      </div>

      <div>
        <Link href="/hour">
          <Button>{activeHour != null ? "Return to the Hour in progress" : "Start an Hour"}</Button>
        </Link>
      </div>

      <nav aria-label="Work Engine" className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
        {LINKS.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="font-mono text-label uppercase tracking-[0.1em] text-accent underline-offset-4 hover:underline"
          >
            {label}
          </Link>
        ))}
      </nav>
    </Panel>
  );
}
