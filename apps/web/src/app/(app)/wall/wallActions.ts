"use server";

import { listWall, type WallCursor, type WallPage } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface WallActionResult {
  ok: boolean;
  error?: string;
  data?: WallPage;
}

/**
 * One page older than `before`. Keyset, not offset: the Wall is append-only and read
 * newest-first, so an offset pager would shift under the reader every time an Hour
 * completes mid-session and silently duplicate or skip a tile.
 *
 * `totalCount` comes back null on every page after the first by design -- the head count
 * is one query on the first page only, and the header's "all time" figure must never
 * quietly become a page length.
 */
export async function loadOlderWallAction(before: WallCursor): Promise<WallActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await listWall(client, user.id, { before });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
