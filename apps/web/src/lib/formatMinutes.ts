/** "1h 40m" / "40m" / "2h" — the one minutes-to-duration formatter, used wherever a raw
 *  minutes figure from the engine (workload, capacity, calibrated estimates) needs a
 *  human string. Purely presentational — the number itself always comes from packages/core. */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
