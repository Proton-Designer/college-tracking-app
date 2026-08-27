import "server-only";
import {
  loadCalendarHorizon as loadSharedCalendarHorizon,
  loadThisWeekView as loadSharedThisWeekView,
  type CalendarHorizon,
  type ThisWeekView,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Web's calendar loaders. The read model itself lives in
 * `packages/api/src/planning/calendarView.ts` so that mobile renders the same horizon from
 * the same code -- these wrappers only resolve the server client and the signed-in user,
 * which is the genuinely platform-specific part.
 *
 * Re-exported types keep existing component imports from this module working unchanged.
 */
export type CalendarData = CalendarHorizon;
export type ThisWeekData = ThisWeekView;
export type { CalendarObligation, BackplanChain } from "@collegeos/api";

export type CalendarLoadResult = { ok: true; data: CalendarData } | { ok: false; error: string };
export type ThisWeekLoadResult = { ok: true; data: ThisWeekData } | { ok: false; error: string };

export async function loadCalendarHorizon(): Promise<CalendarLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await loadSharedCalendarHorizon(client, user.id);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function loadThisWeekView(): Promise<ThisWeekLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await loadSharedThisWeekView(client, user.id);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
