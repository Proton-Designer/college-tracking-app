import type { TaskSession } from "@collegeos/api";

/**
 * D20 -- the record argues with the story, but only when it actually has something to
 * argue. Branches on whether an ended session exists for this task today, never on
 * whether the total is positive: collapsing "no session ran" and "a session summed to 0"
 * into the same render reintroduces the exact gap this feature exists to close (a session
 * that starts and ends inside the same minute is the only way the zero case occurs
 * naturally, so it won't show up in normal testing -- verify it with a deliberately
 * inserted session row, not by waiting for one to happen).
 *
 * A session's `actual_duration_min` is only ever null while it's still active (see
 * focusSessions.ts) -- both a completed and an abandoned session get it, so both count:
 * an abandoned session still spent real minutes.
 *
 * Shared by MitList and FocusLauncher so the two can never independently decide what
 * "logged" means and end up contradicting each other on the same screen.
 */
export function loggedMinutesFragment(sessions: readonly TaskSession[], taskId: number): string | null {
  const ended = sessions.filter((s) => s.task_id === taskId && s.actual_duration_min != null);
  if (ended.length === 0) return null;

  const total = ended.reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);
  return total === 0 ? " · under a minute logged today" : ` · ${total} min logged today`;
}
