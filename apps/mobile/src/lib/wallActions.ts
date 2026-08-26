import { listWall, type WallCursor, type WallTile } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

export interface WallDay {
  localDate: string;
  tiles: WallTile[];
}

export interface WallLoad {
  days: WallDay[];
  nextCursor: WallCursor | null;
  /** All-time count; null on follow-up pages (the first page already supplied it). */
  totalCount: number | null;
}

/**
 * One page of the Wall, grouped by local day, newest first. Keyset-paged: pass the
 * previous load's nextCursor to fetch older Hours (a semester of 4 Hours/day passes
 * 200 rows in ~7 weeks, so the cap WILL be reached in normal use).
 *
 * Grouping happens here rather than in SQL because the tiles arrive already ordered by
 * (local_date desc, hour_index desc) -- a single pass is enough, and pushing a GROUP BY
 * into Postgres would return shapes that need reassembling anyway.
 */
export async function loadWall(
  userId: string,
  before?: WallCursor,
): Promise<{ ok: true; data: WallLoad } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const result = await listWall(client, userId, before != null ? { before } : {});
  if (!result.ok) return { ok: false, error: result.error.message };

  const days: WallDay[] = [];
  for (const tile of result.data.tiles) {
    const last = days[days.length - 1];
    if (last != null && last.localDate === tile.localDate) last.tiles.push(tile);
    else days.push({ localDate: tile.localDate, tiles: [tile] });
  }
  return { ok: true, data: { days, nextCursor: result.data.nextCursor, totalCount: result.data.totalCount } };
}
