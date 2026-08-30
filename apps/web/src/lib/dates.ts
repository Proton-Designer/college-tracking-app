import { daysBetween, type LocalDate } from "@collegeos/core";

/** "past due" / "due today" / "due tomorrow" / "due in N days" — the one wording for
 *  how-long-until-a-deadline used everywhere it appears (deadline radar, courses, calendar). */
export function daysRemainingLabel(today: LocalDate, localDueDate: LocalDate): string {
  const days = daysBetween(today, localDueDate);
  if (days < 0) return "past due";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/** "Aug 21" — a raw ISO date is never shown directly to a user. */
export function formatShortDate(localDate: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}

/** "5:41 AM" — an ISO instant rendered on the user's own wall clock. Prayer windows come out
 *  of `packages/core` as instants (never `Date`s, never pre-formatted), so the timezone has to
 *  be applied here; formatting in the browser's zone would show the wrong time for anyone
 *  whose profile timezone isn't where their laptop is. Kept in sync with
 *  apps/mobile/src/lib/dates.ts's formatClockTime. */
export function formatClockTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** "9:00 AM" from a Postgres `time` ("09:00" or "09:00:00"). A time-of-day has no date and no
 *  zone — a work shift is "nine in the morning" wherever you are, so this deliberately does
 *  NOT go through a timezone the way `formatClockTime` does. Kept in sync with
 *  apps/mobile/src/lib/dates.ts's formatTimeOfDay. */
export function formatTimeOfDay(time: string): string {
  const [rawHour, rawMinute] = time.split(":");
  const hour = Number(rawHour);
  if (!Number.isInteger(hour) || rawMinute == null) return time;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${rawMinute} ${suffix}`;
}
