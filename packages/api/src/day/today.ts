import { localDateFromInstant, type LocalDate } from '@collegeos/core';

/**
 * The single I/O-boundary wrapper around packages/core's `localDateFromInstant` — the
 * only place in packages/api allowed to default `now` to the ambient clock. Every other
 * function that needs "today" takes a `LocalDate` (or this function's result) as an
 * explicit parameter rather than calling `new Date()` itself, so there is exactly one
 * place a clock-related bug could live.
 */
export function getUserLocalToday(timezone: string, now: Date = new Date()): LocalDate {
  return localDateFromInstant(now, timezone);
}
