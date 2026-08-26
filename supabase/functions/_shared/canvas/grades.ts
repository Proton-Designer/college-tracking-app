// Canvas grades → Ledger, staged (docs/CANVAS_AUDIT.md §4.3, migration 45). The poll
// stages graded submissions; applying one to a grade_items row happens only here, on
// the user's explicit confirmation -- fourth instance of one-path-to-done, and this
// module is the one path.

// deno-lint-ignore-file no-explicit-any
type AnySupabaseClient = any;

import { listGradedSubmissions } from "./api.ts";
import { getCanvasToken } from "./keyStore.ts";

export type GradePollResult =
  | { kind: "notConnected" }
  | { kind: "noLinks" }
  | { kind: "noToken" }
  | { kind: "polled"; fetched: number; staged: number; updated: number; skippedSettled: number };

/**
 * Stages every graded, posted submission across the linked courses. Dedupe on
 * (user, canvas_assignment_id): settled rows (applied/rejected) are never re-staged; a
 * still-pending row whose score changed (a regrade before the user confirmed) is
 * UPDATED, because confirming a stale number would write a wrong grade with the user's
 * own hands.
 */
export async function pollGradesForUser(client: AnySupabaseClient, userId: string): Promise<GradePollResult> {
  const { data: connection, error: connError } = await client
    .from("canvas_connections")
    .select("id, base_url")
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

  let fetched = 0;
  let staged = 0;
  let updated = 0;
  let skippedSettled = 0;

  for (const link of links) {
    const submissions = await listGradedSubmissions(connection.base_url, token, link.canvas_course_id);
    fetched += submissions.length;
    if (submissions.length === 0) continue;

    const { data: existingRows, error: existingError } = await client
      .from("canvas_grade_extractions")
      .select("id, canvas_assignment_id, status, score")
      .eq("user_id", userId)
      .in("canvas_assignment_id", submissions.map((s) => s.assignmentId));
    if (existingError) throw new Error(`Failed to read staged grades: ${existingError.message}`);
    const existingByAssignment = new Map(
      (existingRows ?? []).map((r: { canvas_assignment_id: number }) => [r.canvas_assignment_id, r]),
    );

    // The suggestion source: this course's grade items, matched by exact
    // case-insensitive name. A suggestion, never trusted -- the user confirms.
    const { data: gradeItems, error: gradeItemsError } = await client
      .from("grade_items")
      .select("id, name")
      .eq("user_id", userId)
      .eq("course_id", link.course_id);
    if (gradeItemsError) throw new Error(`Failed to read grade items: ${gradeItemsError.message}`);
    const gradeItemByName = new Map(
      (gradeItems ?? []).map((g: { id: number; name: string }) => [g.name.trim().toLowerCase(), g.id]),
    );

    for (const submission of submissions) {
      const existing = existingByAssignment.get(submission.assignmentId) as
        | { id: number; status: string; score: string | number }
        | undefined;
      if (existing != null) {
        if (existing.status !== "pending") {
          skippedSettled++;
          continue;
        }
        if (Number(existing.score) !== submission.score) {
          const { error: updateError } = await client
            .from("canvas_grade_extractions")
            .update({ score: submission.score, graded_at: submission.gradedAt, synced_at: new Date().toISOString() })
            .eq("id", existing.id)
            .eq("user_id", userId);
          if (updateError) throw new Error(`Failed to update staged grade: ${updateError.message}`);
          updated++;
        }
        continue;
      }

      const suggested = gradeItemByName.get(submission.assignmentName.trim().toLowerCase()) ?? null;
      const { error: insertError } = await client.from("canvas_grade_extractions").insert({
        user_id: userId,
        course_id: link.course_id,
        canvas_assignment_id: submission.assignmentId,
        canvas_assignment_name: submission.assignmentName,
        score: submission.score,
        points_possible: submission.pointsPossible,
        graded_at: submission.gradedAt,
        ...(suggested != null ? { suggested_grade_item_id: suggested } : {}),
      });
      if (insertError) {
        if (insertError.code === "23505") {
          skippedSettled++;
          continue;
        }
        throw new Error(`Failed to stage grade for "${submission.assignmentName}": ${insertError.message}`);
      }
      staged++;
    }
  }

  return { kind: "polled", fetched, staged, updated, skippedSettled };
}

export type ApplyGradeResult =
  | { kind: "applied"; gradeItemId: number; scorePct: number | null }
  | { kind: "rejected" }
  | { kind: "refused"; reason: string };

/**
 * The confirmation. Refusals are precise and re-editable, syllabus-confirm's grammar:
 * a points-scale mismatch between Canvas and the Ledger row is named, never silently
 * scaled -- scaling would fabricate a number the user did not enter anywhere.
 */
export async function decideGradeExtraction(
  client: AnySupabaseClient,
  input: { userId: string; extractionId: number; decision: "applied" | "rejected"; gradeItemId?: number },
): Promise<ApplyGradeResult> {
  const { data: extraction, error: extractionError } = await client
    .from("canvas_grade_extractions")
    .select("id, course_id, score, points_possible, status")
    .eq("id", input.extractionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (extractionError) throw new Error(`Failed to read staged grade: ${extractionError.message}`);
  if (extraction == null) return { kind: "refused", reason: "That staged grade could not be found." };
  if (extraction.status !== "pending") {
    return { kind: "refused", reason: "This grade was already decided — nothing applies twice." };
  }

  if (input.decision === "rejected") {
    const { error } = await client
      .from("canvas_grade_extractions")
      .update({ status: "rejected" })
      .eq("id", extraction.id)
      .eq("user_id", input.userId);
    if (error) throw new Error(`Failed to reject: ${error.message}`);
    return { kind: "rejected" };
  }

  if (input.gradeItemId == null) {
    return { kind: "refused", reason: "Pick the Ledger row this grade belongs to — nothing is guessed." };
  }

  const { data: gradeItem, error: gradeItemError } = await client
    .from("grade_items")
    .select("id, course_id, points_possible")
    .eq("id", input.gradeItemId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (gradeItemError) throw new Error(`Failed to read grade item: ${gradeItemError.message}`);
  if (gradeItem == null) return { kind: "refused", reason: "That Ledger row could not be found." };
  if (gradeItem.course_id !== extraction.course_id) {
    return { kind: "refused", reason: "That Ledger row belongs to a different course." };
  }
  if (
    extraction.points_possible != null &&
    Number(extraction.points_possible) !== Number(gradeItem.points_possible)
  ) {
    return {
      kind: "refused",
      reason:
        `Points scales disagree: Canvas says out of ${Number(extraction.points_possible)}, the Ledger row says ` +
        `out of ${Number(gradeItem.points_possible)}. Fix the Ledger row first — scores are never silently rescaled.`,
    };
  }

  const { error: applyError } = await client
    .from("grade_items")
    .update({ points_earned: Number(extraction.score) })
    .eq("id", gradeItem.id)
    .eq("user_id", input.userId);
  if (applyError) throw new Error(`Failed to write the grade: ${applyError.message}`);

  const { error: settleError } = await client
    .from("canvas_grade_extractions")
    .update({ status: "applied", applied_grade_item_id: gradeItem.id, applied_at: new Date().toISOString() })
    .eq("id", extraction.id)
    .eq("user_id", input.userId);
  if (settleError) throw new Error(`Failed to settle the staged grade: ${settleError.message}`);

  const scorePct =
    gradeItem.points_possible != null && Number(gradeItem.points_possible) > 0
      ? (Number(extraction.score) / Number(gradeItem.points_possible)) * 100
      : null;
  return { kind: "applied", gradeItemId: gradeItem.id, scorePct };
}
