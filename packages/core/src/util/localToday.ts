import type { LocalDate } from './date';

/**
 * The one true "instant -> local calendar date" conversion on the TypeScript side,
 * mirroring `public.local_date()` in supabase/migrations/00000000000002_enums_and_helpers.sql
 * exactly (same DST and date-line semantics — see that function's pgTAP suite). `now` is
 * always an injected parameter, never read from the ambient clock, per §0's conventions.
 *
 * This is the only function in the codebase allowed to answer "what local date is it for
 * this user right now" — every caller (day-assembly, backplanning, recovery mode) must
 * route through it (or its packages/api wrapper, `getUserLocalToday`) rather than
 * reimplementing the conversion, so the two never drift.
 */
export function localDateFromInstant(now: Date, timeZone: string): LocalDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA formats as YYYY-MM-DD, which is exactly LocalDate's shape.
  return formatter.format(now);
}
