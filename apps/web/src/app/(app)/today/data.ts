import "server-only";
import {
  getActiveFocusSession,
  getDayView,
  listCourses,
  listKillHabits,
  type Course,
  type DayView,
  type KillHabitRow,
  type TaskSessionRow,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type TodayMode = "onboarding" | "unplanned" | "recovery" | "normal";

export interface TodayData {
  dayView: DayView;
  /** Plain object, not a Map — this crosses the server/client component boundary. */
  courses: Record<number, Course>;
  mode: TodayMode;
  /** Today's active kill-list commitments — SCREEN_SPEC §1.6. Independent of dayView
   *  since it feeds no risk/workload computation, just its own display section. */
  killHabits: KillHabitRow[];
  /** Non-null if the user already has a focus session running — the launcher becomes
   *  "Resume focus" rather than trying to start a second one (the backend would reject
   *  it anyway; this just gives the UI a truthful state to render instead of an error). */
  activeFocusSession: TaskSessionRow | null;
  /** The instant getDayView was computed against — passed to the Day Trace's live cursor so
   *  it never drifts from what the query actually saw. */
  now: Date;
}

export type TodayLoadResult =
  | { ok: true; data: TodayData }
  | { ok: false; error: string };

/**
 * Mode is decided here, once, by the engine's own outputs — never re-derived downstream.
 * `recovery` takes priority over `unplanned` because a triggered Recovery Mode is the more
 * urgent fact even on a day the user hasn't checked in yet.
 */
/** E0_ONBOARDING_SPEC.md: "does this user have at least one course?" is a real data
 *  check, never a has_onboarded flag -- a user who deletes everything gets help again,
 *  not a dead app. Checked first, ahead of recovery/unplanned: the daily ritual (and
 *  Recovery Mode's crisis intervention) both presuppose a semester exists, and neither
 *  should realistically fire for a genuinely empty account, but onboarding wins even if
 *  they somehow do. Archived-only doesn't count -- an archived course is deliberately
 *  excluded from every other live computation (migration 0030's read-path audit), so
 *  it isn't "a semester" for this purpose either. */
function decideMode(dayView: DayView, courseCount: number): TodayMode {
  if (courseCount === 0) return "onboarding";
  if (dayView.recoveryMode.triggered) return "recovery";
  if (dayView.todayCheckin == null) return "unplanned";
  return "normal";
}

export async function loadTodayData(options?: { asOf?: Date }): Promise<TodayLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const now = options?.asOf ?? new Date();
  const [dayViewResult, coursesResult, killHabitsResult, activeFocusSessionResult] = await Promise.all([
    getDayView(client, user.id, now),
    listCourses(client),
    listKillHabits(client, user.id),
    getActiveFocusSession(client, user.id),
  ]);

  if (!dayViewResult.ok) {
    return { ok: false, error: dayViewResult.error.message };
  }
  if (!coursesResult.ok) {
    return { ok: false, error: coursesResult.error.message };
  }
  if (!killHabitsResult.ok) {
    return { ok: false, error: killHabitsResult.error.message };
  }
  if (!activeFocusSessionResult.ok) {
    return { ok: false, error: activeFocusSessionResult.error.message };
  }

  return {
    ok: true,
    data: {
      dayView: dayViewResult.data,
      courses: Object.fromEntries(coursesResult.data.map((c) => [c.id, c])),
      mode: decideMode(dayViewResult.data, coursesResult.data.length),
      killHabits: killHabitsResult.data,
      activeFocusSession: activeFocusSessionResult.data,
      now,
    },
  };
}
