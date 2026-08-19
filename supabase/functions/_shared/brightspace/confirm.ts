// The confirmation gate for staged Brightspace calendar events -- mirrors
// _shared/syllabus/confirm.ts's exact security property: nothing here reads a staged
// row's text content and branches on it; every field is copied verbatim into a
// predetermined INSERT for the ONE extraction id the caller explicitly names.
// Promotion never scans or acts on staged content to decide what to promote.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

export type BrightspaceConfirmationDecision = "confirmed" | "rejected";

export interface ConfirmIcsEventInput {
  extractionId: number;
  userId: string;
  decision: BrightspaceConfirmationDecision;
  /** Whether this occurrence counts as an attendance obligation for Recovery
   *  Mode/MVD purposes (packages/core §6) -- not knowable from the ICS data alone
   *  (a lecture and an assignment-due entry look the same to a parser), so this is an
   *  explicit user decision at confirm time, defaulting to false rather than assuming. */
  isClassMeeting?: boolean;
  courseId?: number;
}

export type ConfirmIcsEventResult = { ok: true; action: "rejected" } | { ok: true; action: "promoted"; calendarEventId: number } | { ok: false; error: string };

interface StagedIcsEventRow {
  id: number;
  user_id: string;
  external_id: string;
  summary: string;
  location: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean;
  course_id: number | null;
  status: string;
}

export async function confirmIcsEvent(client: AnySupabaseClient, input: ConfirmIcsEventInput): Promise<ConfirmIcsEventResult> {
  const { data: extraction, error: fetchError } = await client
    .from("ics_event_extractions")
    .select("id, user_id, external_id, summary, location, start_at, end_at, is_all_day, course_id, status")
    .eq("id", input.extractionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!extraction) return { ok: false, error: "Staged event not found." };

  const row = extraction as StagedIcsEventRow;
  // Idempotency: an already-processed row is never re-promoted or re-rejected,
  // regardless of what the caller asks for -- the same rule syllabus-confirm enforces,
  // and what keeps a retried/duplicated request from double-writing calendar_events.
  if (row.status !== "pending") {
    return { ok: false, error: `Staged event ${row.id} is already ${row.status}, not pending.` };
  }

  if (input.decision === "rejected") {
    const { error } = await client.from("ics_event_extractions").update({ status: "rejected", confirmed_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, action: "rejected" };
  }

  // calendar_events requires end_at > start_at strictly (constraint
  // calendar_events_time_order) -- a DTEND-less VEVENT is technically a zero-duration
  // "point in time" per RFC 5545, which that constraint can never satisfy, so a real
  // default duration is required regardless of case. All-day: RFC 5545's own
  // convention, spans a single day. Timed: a 1-hour default, the common calendar-UI
  // convention for a point event, not a fabricated fact about the real meeting length.
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;
  const endAt = row.end_at ?? new Date(new Date(row.start_at).getTime() + (row.is_all_day ? ONE_DAY_MS : ONE_HOUR_MS)).toISOString();

  const { data: inserted, error: insertError } = await client
    .from("calendar_events")
    .insert({
      user_id: input.userId,
      external_id: row.external_id,
      source: "ics",
      title: row.summary,
      start_at: row.start_at,
      end_at: endAt,
      is_busy: true,
      is_class_meeting: input.isClassMeeting ?? false,
      course_id: input.courseId ?? row.course_id,
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  const { error: statusError } = await client.from("ics_event_extractions").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", row.id);
  if (statusError) return { ok: false, error: statusError.message };

  return { ok: true, action: "promoted", calendarEventId: inserted.id };
}
