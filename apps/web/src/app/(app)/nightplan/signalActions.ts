"use server";

import { getOwnProfile, getUserLocalToday, saveAllocation } from "@collegeos/api";
import type { LifeDomain } from "@collegeos/core";
import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type SignalActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * The close-out's answer path.
 *
 * `source` is always `'user'` here, and that is the whole point of having a separate write path:
 * an answer given by a person is a confession and counts toward coverage as one, while a window
 * filled from evidence is recorded by whatever produced the evidence. Collapsing the two would
 * make the coverage figure unable to tell the difference — and the difference is what D33's
 * amendment is about.
 */
export async function saveAllocationAction(input: {
  windowStart: string;
  windowEnd: string;
  minutesByDomain: Partial<Record<LifeDomain, number>>;
}): Promise<SignalActionResult<true>> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };

  // The local day comes from the profile timezone, never the browser. A window answered at
  // 11:50pm belongs to the day being lived, not to whatever UTC says (B4).
  const localDate = getUserLocalToday(profile.data.timezone, new Date());

  const result = await saveAllocation(client, user.id, {
    localDate,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    minutesByDomain: input.minutesByDomain,
    source: "user",
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/nightplan");
  revalidatePath("/review");
  return { ok: true, data: true };
}
