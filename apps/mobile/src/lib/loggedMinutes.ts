/** R1: a task with no focus session today and one whose only session rounded to zero real
 *  minutes are different facts and must not render identically. `null` means no session
 *  exists for this task today; `0` is a real, honestly-recorded near-zero session (started
 *  and ended inside the same minute) and gets its own copy rather than a bare "0 min", which
 *  reads as failure for what was actually a real, if brief, session. */
export function formatLoggedMinutesSuffix(minutes: number | null): string {
  if (minutes == null) return "";
  if (minutes === 0) return " · under a minute logged today";
  return ` · ${minutes} min logged today`;
}
