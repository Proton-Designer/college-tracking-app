import { daysBetween, type LocalDate } from "@collegeos/core";

/** "past due" / "due today" / "due tomorrow" / "due in N days" — kept in sync with
 *  apps/web/src/lib/dates.ts so the wording never diverges between platforms. */
export function daysRemainingLabel(today: LocalDate, localDueDate: LocalDate): string {
  const days = daysBetween(today, localDueDate);
  if (days < 0) return "past due";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/** "Aug 21" — a raw ISO date is never shown directly to a user. Kept in sync with
 *  apps/web/src/lib/dates.ts's formatShortDate. */
export function formatShortDate(localDate: LocalDate): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}
