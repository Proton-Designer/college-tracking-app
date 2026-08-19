import "server-only";
import { getDayView, listCourses, type Course, type DayView } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type TodayMode = "unplanned" | "recovery" | "normal";

export interface TodayData {
  dayView: DayView;
  /** Plain object, not a Map — this crosses the server/client component boundary. */
  courses: Record<number, Course>;
  mode: TodayMode;
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
function decideMode(dayView: DayView): TodayMode {
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
  const [dayViewResult, coursesResult] = await Promise.all([
    getDayView(client, user.id, now),
    listCourses(client),
  ]);

  if (!dayViewResult.ok) {
    return { ok: false, error: dayViewResult.error.message };
  }
  if (!coursesResult.ok) {
    return { ok: false, error: coursesResult.error.message };
  }

  return {
    ok: true,
    data: {
      dayView: dayViewResult.data,
      courses: Object.fromEntries(coursesResult.data.map((c) => [c.id, c])),
      mode: decideMode(dayViewResult.data),
      now,
    },
  };
}
