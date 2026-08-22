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
