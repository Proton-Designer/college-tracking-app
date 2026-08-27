// The announcements poll -- the manual-paste killer (BLUEPRINT Part XI). Fetches new
// Canvas announcements for every linked course and stages them as `announcements` rows
// (source='canvas'), which drops them into the EXISTING parse → review → confirm
// pipeline. The poll replaces the paste gesture, never the confirmation: nothing here
// touches deliverables, and nothing ever will (one-path-to-done, third pipeline's rule).

// deno-lint-ignore-file no-explicit-any
type AnySupabaseClient = any;

import { listAnnouncements } from "./api.ts";
import { getCanvasToken } from "./keyStore.ts";

/** Re-fetch overlap behind the watermark: a clock is not a transaction log, and an
 *  announcement posted moments before the last poll's watermark write must not fall
 *  through the crack. Dedupe on external_id makes the overlap free. */
const OVERLAP_MS = 24 * 60 * 60 * 1000;

/** First poll looks back two weeks -- enough to seed the semester's recent context
 *  without staging months of stale announcements for confirmation. */
const FIRST_POLL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * P2-style prompt-bounding gap, closed: parse-announcement's manual-paste path
 * (parse-announcement/index.ts) zod-caps pasted text at 20,000 chars before it ever
 * reaches the parse prompt. This poll -- the "manual-paste killer" -- fed the SAME
 * prompt from Canvas's title+message with no cap at all, and it runs unattended on a
 * cron with zero user gesture: any course announcement (posted by a professor or
 * anyone else with post access to a shared course) could be arbitrarily long and would
 * be sent whole. The unattended path is the one that needed the bound more, not less.
 *
 * Truncate rather than reject: a cron path silently dropping a real announcement (the
 * user never even sees it staged) is worse than staging a truncated one the user can
 * still see, edit, or re-paste in full manually. `truncated` is recorded per item so
 * the sync result can say so rather than silently narrowing what got parsed.
 */
const RAW_TEXT_MAX_CHARS = 20_000;

export interface InsertedAnnouncement {
  announcementId: number;
  courseId: number;
  rawText: string;
  truncated: boolean;
}

export type PollResult =
  | { kind: "notConnected" }
  | { kind: "noLinks" }
  | { kind: "noToken" }
  | {
      kind: "polled";
      fetched: number;
      inserted: InsertedAnnouncement[];
      skippedExisting: number;
      skippedUnmapped: number;
      truncated: number;
    };

export async function pollAnnouncementsForUser(
  client: AnySupabaseClient,
  userId: string,
  now: () => Date,
): Promise<PollResult> {
  const { data: connection, error: connError } = await client
    .from("canvas_connections")
    .select("id, base_url, last_polled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (connError) throw new Error(`Failed to read Canvas connection: ${connError.message}`);
  if (connection == null) return { kind: "notConnected" };

  const { data: links, error: linksError } = await client
    .from("canvas_course_links")
    .select("course_id, canvas_course_id")
    .eq("user_id", userId);
  if (linksError) throw new Error(`Failed to read course links: ${linksError.message}`);
  if (links == null || links.length === 0) return { kind: "noLinks" };

  const token = await getCanvasToken(client, userId);
  if (token == null) return { kind: "noToken" };

  const pollStart = now();
  const windowStart =
    connection.last_polled_at != null
      ? new Date(new Date(connection.last_polled_at).getTime() - OVERLAP_MS)
      : new Date(pollStart.getTime() - FIRST_POLL_WINDOW_MS);

  const courseIdByContext = new Map<string, number>(
    links.map((l: { course_id: number; canvas_course_id: number }) => [`course_${l.canvas_course_id}`, l.course_id]),
  );

  const announcements = await listAnnouncements(
    connection.base_url,
    token,
    [...courseIdByContext.keys()],
    windowStart.toISOString(),
  );

  // One narrow read answers "which of these have we already staged" -- scoped by
  // user_id (D18's discipline applies to product code exactly as to tests).
  const externalIds = announcements.map((a) => String(a.id));
  const existing = new Set<string>();
  if (externalIds.length > 0) {
    const { data: existingRows, error: existingError } = await client
      .from("announcements")
      .select("external_id")
      .eq("user_id", userId)
      .in("external_id", externalIds);
    if (existingError) throw new Error(`Failed to check staged announcements: ${existingError.message}`);
    for (const row of existingRows ?? []) {
      if (row.external_id != null) existing.add(row.external_id);
    }
  }

  const inserted: InsertedAnnouncement[] = [];
  let skippedExisting = 0;
  let skippedUnmapped = 0;
  let truncatedCount = 0;

  for (const announcement of announcements) {
    const externalId = String(announcement.id);
    if (existing.has(externalId)) {
      skippedExisting++;
      continue;
    }
    const courseId = courseIdByContext.get(announcement.contextCode);
    if (courseId == null) {
      // An unlinked course's announcement: the user chose not to map it. Skipped, and
      // counted so the sync result can say so rather than silently narrowing coverage.
      skippedUnmapped++;
      continue;
    }
    const combined = announcement.message.length > 0 ? `${announcement.title}\n\n${announcement.message}` : announcement.title;
    const truncated = combined.length > RAW_TEXT_MAX_CHARS;
    const rawText = truncated ? combined.slice(0, RAW_TEXT_MAX_CHARS) : combined;
    if (truncated) truncatedCount++;
    const { data: created, error: insertError } = await client
      .from("announcements")
      .insert({
        user_id: userId,
        course_id: courseId,
        raw_text: rawText,
        source: "canvas",
        external_id: externalId,
      })
      .select("id")
      .single();
    if (insertError) {
      // A unique-violation race (cron + manual sync overlapping) is a skip, not a failure.
      if (insertError.code === "23505") {
        skippedExisting++;
        continue;
      }
      throw new Error(`Failed to stage announcement ${externalId}: ${insertError.message}`);
    }
    inserted.push({ announcementId: created.id, courseId, rawText, truncated });
  }

  const { error: watermarkError } = await client
    .from("canvas_connections")
    .update({ last_polled_at: pollStart.toISOString() })
    .eq("id", connection.id)
    .eq("user_id", userId);
  if (watermarkError) throw new Error(`Failed to advance poll watermark: ${watermarkError.message}`);

  return { kind: "polled", fetched: announcements.length, inserted, skippedExisting, skippedUnmapped, truncated: truncatedCount };
}
