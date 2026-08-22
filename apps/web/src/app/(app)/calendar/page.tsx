import Link from "next/link";
import { HorizonView } from "@/components/calendar/HorizonView";
import { ThisWeekView } from "@/components/calendar/ThisWeekView";
import { PageHeader } from "@/components/ui";
import { loadCalendarHorizon, loadThisWeekView } from "./data";

type CalendarView = "week" | "horizon";

function ViewSwitcher({ active }: { active: CalendarView }) {
  return (
    <div className="flex gap-1 rounded-md border border-hairline bg-surface-sunken p-1">
      <Link
        href="/calendar?view=week"
        aria-current={active === "week" ? "page" : undefined}
        className={`rounded-sm px-3 py-1.5 font-mono text-body-s outline-none transition-colors duration-90 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 ${
          active === "week" ? "bg-surface font-medium text-ink" : "text-ink-muted hover:text-ink"
        }`}
      >
        This week
      </Link>
      <Link
        href="/calendar?view=horizon"
        aria-current={active === "horizon" ? "page" : undefined}
        className={`rounded-sm px-3 py-1.5 font-mono text-body-s outline-none transition-colors duration-90 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 ${
          active === "horizon" ? "bg-surface font-medium text-ink" : "text-ink-muted hover:text-ink"
        }`}
      >
        Horizon
      </Link>
    </div>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  // "This week" is the default -- the more actionable view, and the one the source brief's
  // Sunday session is actually about. Horizon stays one tap away, never the landing state.
  const view: CalendarView = rawView === "horizon" ? "horizon" : "week";

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <PageHeader title="Calendar" actions={<ViewSwitcher active={view} />} />
      {view === "week" ? <ThisWeekSection /> : <HorizonSection />}
    </main>
  );
}

async function ThisWeekSection() {
  const result = await loadThisWeekView();
  if (!result.ok) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this week&apos;s plan</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/calendar?view=week" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </Link>
      </div>
    );
  }
  return <ThisWeekView today={result.data.today} timezone={result.data.timezone} plan={result.data.plan} />;
}

async function HorizonSection() {
  const result = await loadCalendarHorizon();
  if (!result.ok) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the calendar</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/calendar?view=horizon" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </Link>
      </div>
    );
  }
  return <HorizonView data={result.data} />;
}
