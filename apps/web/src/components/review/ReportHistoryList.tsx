import type { AgentReport } from "@collegeos/api";
import Link from "next/link";

function formatDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

/** SCREEN_SPEC §6 — "history plus the nightly report": a date list to navigate prior
 *  reports, alongside whichever one is currently open. */
export function ReportHistoryList({ history, currentDate }: { history: AgentReport[]; currentDate: string }) {
  if (history.length === 0) {
    return <p className="font-mono text-caption text-ink-faint">No reports yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {history.map((report) => {
        const active = report.local_date === currentDate;
        return (
          <li key={report.id}>
            <Link
              href={`/review/${report.local_date}`}
              className={`block rounded-sm px-2 py-1.5 font-mono text-caption transition-colors ${
                active ? "bg-accent-wash text-ink" : "text-ink-faint hover:bg-surface-sunken hover:text-ink"
              }`}
            >
              {formatDate(report.local_date)}
              {report.model === "deterministic" ? null : <span className="ml-1 text-accent">·</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
