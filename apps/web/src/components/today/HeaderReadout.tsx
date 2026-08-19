export interface HeaderReadoutProps {
  dateLabel: string;
  sleepHours?: number | null;
  whoopRecoveryPct?: number | null;
}

/** SCREEN_SPEC §1.2 — absent (not a placeholder card) when there's no physiological data. */
export function HeaderReadout({ dateLabel, sleepHours, whoopRecoveryPct }: HeaderReadoutProps) {
  const hasHealth = sleepHours != null || whoopRecoveryPct != null;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{dateLabel}</h1>
      {hasHealth ? (
        <p className="font-mono text-body-s tabular-nums text-ink-muted">
          {sleepHours != null ? `Sleep ${Math.floor(sleepHours)}h ${Math.round((sleepHours % 1) * 60)}m` : null}
          {sleepHours != null && whoopRecoveryPct != null ? " · " : null}
          {whoopRecoveryPct != null ? `Recovery ${Math.round(whoopRecoveryPct)}` : null}
        </p>
      ) : null}
    </div>
  );
}
