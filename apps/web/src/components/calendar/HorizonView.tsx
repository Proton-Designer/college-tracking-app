import { CapacityStrip } from "@/components/calendar/CapacityStrip";
import { BackplanChain } from "@/components/courses/BackplanChain";
import { Panel, RiskPill } from "@/components/ui";
import { daysRemainingLabel } from "@/lib/dates";
import type { CalendarData, CalendarObligation } from "@/app/(app)/calendar/data";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

/** The prior single view, now named for what it is (the data loader was already called
 *  loadCalendarHorizon) rather than "the calendar" -- a longer-range deadline+capacity
 *  look-ahead, distinct from This Week's near-term committed plan. */
export function HorizonView({ data }: { data: CalendarData }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Uncommitted time, next two weeks</h2>
        <Panel>
          <CapacityStrip days={data.capacity} />
        </Panel>
      </section>

      {data.obligations.length === 0 ? (
        <p className="text-body-s text-ink-muted">Nothing open on the horizon.</p>
      ) : (
        <Panel>
          <ul className="flex flex-col">
            {data.obligations.map((o) => (
              <ObligationRow key={o.deliverable.id} obligation={o} courseCode={data.courses[o.deliverable.course_id]?.code ?? "—"} today={data.today} />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function ObligationRow({
  obligation,
  courseCode,
  today,
}: {
  obligation: CalendarObligation;
  courseCode: string;
  today: string;
}) {
  const { deliverable, risk, backplan } = obligation;

  return (
    <li className="flex items-start justify-between gap-4 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-body text-ink">{deliverable.title}</span>
        <span className="font-mono text-caption text-ink-faint">
          {courseCode} · {typeLabel(deliverable.type)} · {daysRemainingLabel(today, deliverable.local_due_date)}
        </span>
        <BackplanChain chain={backplan} />
      </div>
      {risk ? (
        <div className="flex items-center gap-2">
          <RiskPill band={risk.result.band} label={risk.result.band.toUpperCase()} />
          <span className="font-mono text-body-s tabular-nums text-ink-muted">{risk.result.score}</span>
        </div>
      ) : null}
    </li>
  );
}
