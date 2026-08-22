import type { TodayHealth } from "@collegeos/api";

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDelta(hours: number, baselineHours: number): string {
  const diff = hours - baselineHours;
  const arrow = diff < 0 ? "↓" : diff > 0 ? "↑" : "→";
  return `${arrow}${Math.abs(diff).toFixed(1)}h vs baseline`;
}

export function TodayHeader({
  today,
  health,
  sleepBaselineHours,
}: {
  today: string;
  health: TodayHealth | null;
  sleepBaselineHours: number | null;
}) {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${today}T00:00:00Z`));

  const readoutParts: string[] = [];
  if (health?.sleepHours != null) {
    const sleepPart =
      sleepBaselineHours != null
        ? `Sleep ${formatSleep(health.sleepHours)} (${formatDelta(health.sleepHours, sleepBaselineHours)})`
        : `Sleep ${formatSleep(health.sleepHours)}`;
    readoutParts.push(sleepPart);
  }
  if (health?.whoopRecoveryPct != null) {
    readoutParts.push(`Recovery ${Math.round(health.whoopRecoveryPct)}`);
  }

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h1 className="font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">{dateLabel}</h1>
      {readoutParts.length > 0 ? (
        <p className="font-mono text-body-s tabular-nums text-ink-muted">{readoutParts.join(" · ")}</p>
      ) : null}
    </div>
  );
}
