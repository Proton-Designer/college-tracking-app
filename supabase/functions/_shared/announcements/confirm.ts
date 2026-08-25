// The ONLY path from a staged announcement diff to a real deliverables write -- the same
// security property syllabus/confirm.ts documents, for the same reason: RLS lets a
// user's own client write deliverables directly, so a client-side confirmation check is
// advisory only. Server-side, the unresolved-date rejection and the all-or-nothing apply
// cannot be walked around by a bug or a future refactor.

import { z } from "zod";
import { localTimeToInstant } from "../core/index.ts";
import { AnnouncementChangeSchema } from "./parse.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

/** The diff as stored/edited: same change schema the parser stages, revalidated here so
 *  an edited payload cannot smuggle a shape the parser could never have produced. */
const DiffSchema = z.object({ changes: z.array(AnnouncementChangeSchema).min(1) });

export interface ConfirmAnnouncementInput {
  announcementId: number;
  userId: string;
  decision: "confirmed" | "edited" | "rejected";
  /** Required when decision is 'edited'; ignored otherwise. */
  editedDiff?: unknown;
}

export type ConfirmAnnouncementResult =
  | { ok: true; applied: { dateChanges: number; newItems: number; notes: number } }
  | { ok: true; rejected: true }
  | { ok: false; error: string };

/**
 * Deliverables are due at end-of-day in the user's own timezone -- the same convention
 * courseActions established for manual entry, reused rather than re-decided.
 */
const DUE_HOUR = 23;
const DUE_MINUTE = 59;

export async function applyAnnouncement(
  client: AnySupabaseClient,
  input: ConfirmAnnouncementInput,
): Promise<ConfirmAnnouncementResult> {
  const { data: announcement, error: fetchError } = await client
    .from("announcements")
    .select("id, course_id, parsed_diff, status")
    .eq("id", input.announcementId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!announcement) return { ok: false, error: "Announcement not found." };

  // Idempotency, same as promoteExtraction: a processed row is never re-applied,
  // regardless of what the caller asks for.
  if (announcement.status !== "parsed") {
    return { ok: false, error: `Announcement ${announcement.id} is ${announcement.status}, not parsed.` };
  }

  if (input.decision === "rejected") {
    const { error } = await client
      .from("announcements")
      .update({ status: "rejected" })
      .eq("id", announcement.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, rejected: true };
  }

  // 'edited' re-validates against the SAME schema the parser is held to.
  const diffSource = input.decision === "edited" ? input.editedDiff : announcement.parsed_diff;
  const diff = DiffSchema.safeParse(diffSource);
  if (!diff.success) {
    return { ok: false, error: `Diff is not valid: ${diff.error.issues[0]?.message ?? "unknown"}` };
  }

  // ---- Validate EVERYTHING before writing ANYTHING (the weight-sum-check discipline).

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("timezone")
    .eq("id", input.userId)
    .single();
  if (profileError) return { ok: false, error: profileError.message };

  const { data: deliverables, error: delivError } = await client
    .from("deliverables")
    .select("id, title, status")
    .eq("user_id", input.userId)
    .eq("course_id", announcement.course_id);
  if (delivError) return { ok: false, error: delivError.message };
  const byTitle = new Map<string, { id: number; status: string }>(
    (deliverables ?? []).map((d: { id: number; title: string; status: string }) => [d.title, d]),
  );

  const dateChanges: { deliverableId: number; dueAt: string }[] = [];
  const newItems: { title: string; type: string; dueAt: string }[] = [];
  let notes = 0;

  for (const change of diff.data.changes) {
    if (change.kind === "date_change") {
      // Unresolved-date rejection: a null date cannot be applied. The user resolves it by
      // editing ("during finals week" -> a real date), never by the server guessing.
      if (change.newDueDate == null) {
        return {
          ok: false,
          error: `"${change.matchedTitle}" has no resolved date (${change.newDueText ?? "unknown"}). Edit the diff with a real date before confirming.`,
        };
      }
      const target = byTitle.get(change.matchedTitle);
      if (target == null) {
        // All-or-nothing: an unmatched title fails the whole confirm with a nameable
        // reason, rather than applying half a diff and calling the row 'applied'.
        return {
          ok: false,
          error: `No deliverable titled "${change.matchedTitle}" exists in this course. Edit the diff to match a real item.`,
        };
      }
      dateChanges.push({
        deliverableId: target.id,
        dueAt: localTimeToInstant(change.newDueDate, DUE_HOUR, DUE_MINUTE, profile.timezone),
      });
    } else if (change.kind === "new_item") {
      if (change.dueDate == null) {
        return {
          ok: false,
          error: `New item "${change.title}" has no resolved date (${change.dueText ?? "unknown"}). Edit the diff with a real date before confirming.`,
        };
      }
      newItems.push({
        title: change.title,
        type: change.itemType,
        dueAt: localTimeToInstant(change.dueDate, DUE_HOUR, DUE_MINUTE, profile.timezone),
      });
    } else {
      // Notes change no schedule; they live on in the announcement record itself, which
      // stays retrievable per-course with its raw text.
      notes += 1;
    }
  }

  // ---- Apply.

  for (const dc of dateChanges) {
    const { error } = await client
      .from("deliverables")
      .update({ due_at: dc.dueAt })
      .eq("id", dc.deliverableId)
      .eq("user_id", input.userId);
    if (error) return { ok: false, error: error.message };
  }

  if (newItems.length > 0) {
    const rows = newItems.map((item) => ({
      user_id: input.userId,
      course_id: announcement.course_id,
      title: item.title,
      type: item.type,
      due_at: item.dueAt,
      // local_due_date is trigger-computed from due_at + the user's timezone; supplying a
      // placeholder satisfies NOT NULL on insert paths where the trigger fires after
      // column defaults -- the trigger overwrites it before the row lands.
      local_due_date: "1970-01-01",
    }));
    const { error } = await client.from("deliverables").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  const { error: statusError } = await client
    .from("announcements")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      ...(input.decision === "edited" ? { parsed_diff: diff.data } : {}),
    })
    .eq("id", announcement.id);
  if (statusError) return { ok: false, error: statusError.message };

  return { ok: true, applied: { dateChanges: dateChanges.length, newItems: newItems.length, notes } };
}
