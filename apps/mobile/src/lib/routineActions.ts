import {
  getOwnProfile,
  getRoutineItems,
  getUserLocalToday,
  setRoutineItem,
  type RoutineItemState,
} from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * The Morning Routine's item list -- the blueprint's stated five (Part III), not invented.
 * The list lives here rather than in the schema because it is a template; the database
 * stores only which items were ticked on which day. Editability is a later tier.
 */
export const MORNING_ROUTINE_ITEMS: { key: string; label: string }[] = [
  { key: "treadmill", label: "Treadmill 20" },
  { key: "water", label: "1L water" },
  { key: "protein", label: "30g protein" },
  { key: "motivation", label: "Motivation video" },
  { key: "stretch", label: "Stretch 5" },
];

export async function loadMorningRoutine(
  userId: string,
): Promise<{ ok: true; data: Map<string, boolean> } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await getRoutineItems(client, userId, today, "morning");
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: new Map(result.data.map((i: RoutineItemState) => [i.key, i.done])) };
}

export async function toggleMorningItem(
  userId: string,
  key: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await setRoutineItem(client, userId, today, "morning", key, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
