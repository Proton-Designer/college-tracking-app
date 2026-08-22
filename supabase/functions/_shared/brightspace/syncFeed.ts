// Parses an already-fetched ICS feed and stages every event into
// ics_event_extractions -- never calendar_events directly. An iCal feed is no more
// trusted than an LLM extraction (the same reasoning syllabus_extractions is built on):
// Brightspace could be misconfigured, a course could be renamed mid-semester with a
// stale UID still pointing at it, a recurring lecture's RRULE could shift. Confirmation
// (confirm.ts) is the only path from here into the real table.
//
// Takes the ICS text as a parameter rather than fetching it itself -- the HTTP fetch is
// the one genuinely untestable-offline piece (this environment has no real Brightspace
// account), so it's isolated to the thinnest possible layer (the index.ts handler) and
// everything else here is exercised for real against fixture text, same split as
// pdfText.ts vs extract.ts for syllabus extraction.

import { parseIcsFeed } from "../core/index.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

export interface SyncBrightspaceFeedResult {
  staged: number;
  /** Existing confirmed/rejected staged rows a re-sync intentionally left untouched --
   *  a user's prior confirm/reject decision on a specific occurrence must never be
   *  silently reverted or overwritten by a later sync of the same feed. */
  skippedAlreadyDecided: number;
  malformedLineCount: number;
}

interface CourseRow {
  id: number;
  code: string;
}

/** A pure, deliberately simple heuristic (substring match on course code) -- a
 *  suggestion the confirmation UI shows and the user can correct, never trusted as
 *  fact. A real NLP match isn't warranted for what's ultimately a confirm-or-edit
 *  dropdown. */
function matchCourseFromSummary(summary: string, courses: CourseRow[]): CourseRow | null {
  const normalizedSummary = summary.toUpperCase();
  for (const course of courses) {
    if (course.code && normalizedSummary.includes(course.code.toUpperCase())) return course;
  }
  return null;
}

export async function syncBrightspaceFeed(
  client: AnySupabaseClient,
  userId: string,
  feedId: number,
  icsText: string,
): Promise<SyncBrightspaceFeedResult> {
  const { events, malformedLineCount } = parseIcsFeed(icsText);

  // Archived courses are excluded from matching: an incoming ICS event shouldn't get
  // silently attached to a semester that's already over.
  const { data: courses, error: coursesError } = await client
    .from("courses")
    .select("id, code")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (coursesError) throw coursesError;

  let staged = 0;
  let skippedAlreadyDecided = 0;

  for (const event of events) {
    const externalId = event.recurrenceIndex != null ? `${event.uid}#${event.recurrenceIndex}` : event.uid;
    const matchedCourse = matchCourseFromSummary(event.summary, courses ?? []);

    const { data: existing, error: existingError } = await client
      .from("ics_event_extractions")
      .select("id, status")
      .eq("feed_id", feedId)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing && existing.status !== "pending") {
      skippedAlreadyDecided += 1;
      continue;
    }

    const row = {
      user_id: userId,
      feed_id: feedId,
      external_id: externalId,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start_at: event.isAllDay ? `${event.startAt}T00:00:00Z` : event.startAt,
      end_at: event.endAt ? (event.isAllDay ? `${event.endAt}T00:00:00Z` : event.endAt) : null,
      is_all_day: event.isAllDay,
      course_id: matchedCourse?.id ?? null,
      synced_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await client.from("ics_event_extractions").update(row).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("ics_event_extractions").insert({ ...row, status: "pending" });
      if (error) throw error;
    }
    staged += 1;
  }

  const { error: touchError } = await client.from("brightspace_feeds").update({ last_synced_at: new Date().toISOString() }).eq("id", feedId);
  if (touchError) throw touchError;

  return { staged, skippedAlreadyDecided, malformedLineCount };
}
