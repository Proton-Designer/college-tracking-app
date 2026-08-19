/** "1h 40m" / "40m" / "2h" — kept in sync with apps/web/src/lib/formatMinutes.ts. */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
