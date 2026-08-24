import { listWall, type WallTile } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

export interface WallDay {
  localDate: string;
  tiles: WallTile[];
}

/**
 * The Wall, grouped by local day, newest first.
 *
 * Grouping happens here rather than in SQL because the tiles arrive already ordered by
 * (local_date desc, hour_index desc) -- a single pass is enough, and pushing a GROUP BY
 * into Postgres would return shapes that need reassembling anyway.
 */
export async function loadWall(
  userId: string,
): Promise<{ ok: true; data: WallDay[] } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const result = await listWall(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };

  const days: WallDay[] = [];
  for (const tile of result.data) {
    const last = days[days.length - 1];
    if (last != null && last.localDate === tile.localDate) last.tiles.push(tile);
    else days.push({ localDate: tile.localDate, tiles: [tile] });
  }
  return { ok: true, data: days };
}
