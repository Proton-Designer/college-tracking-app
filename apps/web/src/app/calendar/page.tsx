import Link from "next/link";
import { BackplanChain } from "@/components/courses/BackplanChain";
import { RiskPill } from "@/components/ui";
import { daysRemainingLabel } from "@/lib/dates";
import { loadCalendarHorizon, type CalendarObligation } from "./data";

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export default async function CalendarPage() {
  const result = await loadCalendarHorizon();

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the calendar</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/calendar" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </Link>
      </main>
    );
  }

  const { obligations, courses, today } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">Calendar</h1>
      <p className="text-caption text-ink-faint">
        Committed calendar time against available capacity is pending a backend read not yet exposed.
      </p>

      {obligations.length === 0 ? (
        <p className="text-body-s text-ink-faint">Nothing open on the horizon.</p>
      ) : (
        <ul className="flex flex-col">
          {obligations.map((o) => (
            <ObligationRow key={o.deliverable.id} obligation={o} courseCode={courses[o.deliverable.course_id]?.code ?? "—"} today={today} />
          ))}
        </ul>
      )}
    </main>
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
  const { deliverable, risk } = obligation;

  return (
    <li className="flex items-center justify-between gap-4 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-col">
        <span className="text-body text-ink">{deliverable.title}</span>
        <span className="font-mono text-caption text-ink-faint">
          {courseCode} · {typeLabel(deliverable.type)} · {daysRemainingLabel(today, deliverable.local_due_date)}
        </span>
      </div>
      {risk ? (
        <div className="flex items-center gap-2">
          <RiskPill band={risk.result.band} label={risk.result.band.toUpperCase()} />
          <span className="font-mono text-body-s tabular-nums text-ink-faint">{risk.result.score}</span>
        </div>
      ) : null}
    </li>
  );
}
