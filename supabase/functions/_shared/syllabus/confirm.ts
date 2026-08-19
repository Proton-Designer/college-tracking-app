// The confirmation gate — docs/LLM_LAYER_SPEC.md §8, "Do not silently trust LLM
// extraction for academic deadlines" made structural.
//
// The security property this file exists to guarantee: NOTHING an extraction's payload
// contains is ever interpreted as anything other than plain data for the ONE typed field
// it was extracted into. There is no code path here that reads `extracted_payload` and
// executes, evaluates, or branches on its text content — every field is validated by a
// fixed Zod schema and copied verbatim into a specific, predetermined INSERT. A
// malicious string in a `title` field can only ever become a `title` value; it cannot
// change which table is written, which row is touched, or trigger any other action.
// Promotion also only ever happens for the ONE extraction id explicitly named in the
// call, by decision the caller supplies — nothing here scans or acts on extraction
// content to decide what to promote. See confirm.test.ts's prompt-injection test.

import { z } from "zod";
import { PAYLOAD_SCHEMA_BY_ITEM_TYPE, type SyllabusItemType } from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

export type ConfirmationDecision = "confirmed" | "edited" | "rejected";

export interface ConfirmExtractionInput {
  extractionId: number;
  userId: string;
  /** Required for every item type except course_info, which creates the course itself. */
  courseId?: number;
  decision: ConfirmationDecision;
  /** User corrections, if decision='edited'. Re-validated by the same schema as the
   *  original payload -- an edit is not exempt from validation. */
  editedPayload?: Record<string, unknown>;
}

export type ConfirmExtractionResult =
  | { ok: true; action: "rejected" }
  | { ok: true; action: "promoted"; courseId?: number; deliverableId?: number; gradeCategoryId?: number }
  | { ok: false; error: string };

interface StagedExtractionRow {
  id: number;
  user_id: string;
  item_type: SyllabusItemType;
  extracted_payload: Record<string, unknown>;
  status: string;
}

export async function promoteExtraction(
  client: AnySupabaseClient,
  input: ConfirmExtractionInput,
): Promise<ConfirmExtractionResult> {
  const { data: extraction, error: fetchError } = await client
    .from("syllabus_extractions")
    .select("id, user_id, item_type, extracted_payload, status")
    .eq("id", input.extractionId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!extraction) return { ok: false, error: "Extraction not found." };

  const row = extraction as StagedExtractionRow;
  // Idempotency: an already-processed row is never re-promoted, regardless of what the
  // caller asks for -- this is what keeps a retried/duplicated request from double-writing.
  if (row.status !== "pending") {
    return { ok: false, error: `Extraction ${row.id} is already ${row.status}, not pending.` };
  }

  if (input.decision === "rejected") {
    const { error } = await client
      .from("syllabus_extractions")
      .update({ status: "rejected", confirmed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, action: "rejected" };
  }

  const candidatePayload = input.decision === "edited" ? (input.editedPayload ?? {}) : row.extracted_payload;
  const schema = PAYLOAD_SCHEMA_BY_ITEM_TYPE[row.item_type];
  const parsed = schema.safeParse(candidatePayload);
  if (!parsed.success) {
    return { ok: false, error: `Payload failed validation: ${formatZodError(parsed.error)}` };
  }

  const writeResult = await writeConfirmedItem(client, row.item_type, parsed.data, input);
  if (!writeResult.ok) return writeResult;

  const { error: statusError } = await client
    .from("syllabus_extractions")
    .update({ status: input.decision, confirmed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (statusError) return { ok: false, error: statusError.message };

  return { ok: true, action: "promoted", ...writeResult.ids };
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

async function writeConfirmedItem(
  client: AnySupabaseClient,
  itemType: SyllabusItemType,
  // deno-lint-ignore no-explicit-any
  payload: any,
  input: ConfirmExtractionInput,
): Promise<{ ok: true; ids: Record<string, number> } | { ok: false; error: string }> {
  switch (itemType) {
    case "course_info": {
      const { data, error } = await client
        .from("courses")
        .insert({
          user_id: input.userId,
          code: payload.code,
          name: payload.name,
          professor_name: payload.professorName ?? null,
          professor_contact: payload.professorContact ?? null,
          term: payload.term,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, ids: { courseId: data.id } };
    }

    case "assignment":
    case "exam": {
      if (input.courseId == null) return { ok: false, error: "courseId is required to confirm an assignment/exam." };
      const rawDate = itemType === "exam" ? payload.date : payload.dueDate;
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return {
          ok: false,
          error: `"${rawDate}" is not a resolvable date. Relative dates ("during finals week", "TBD") must be resolved to a real date before this can be confirmed.`,
        };
      }
      const { data, error } = await client
        .from("deliverables")
        .insert({
          user_id: input.userId,
          course_id: input.courseId,
          title: payload.title,
          type: itemType === "exam" ? "exam" : payload.type,
          due_at: parsedDate.toISOString(),
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, ids: { deliverableId: data.id } };
    }

    case "grade_category": {
      if (input.courseId == null) return { ok: false, error: "courseId is required to confirm a grade category." };
      const { data, error } = await client
        .from("grade_categories")
        .insert({
          user_id: input.userId,
          course_id: input.courseId,
          name: payload.name,
          weight_pct: payload.weightPct,
          drop_lowest_n: payload.dropLowestN,
          expected_item_count: payload.expectedItemCount,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, ids: { gradeCategoryId: data.id } };
    }

    case "office_hours": {
      if (input.courseId == null) return { ok: false, error: "courseId is required to confirm office hours." };
      const { error } = await client.from("course_office_hours").insert({
        user_id: input.userId,
        course_id: input.courseId,
        day_of_week: payload.dayOfWeek,
        start_time: payload.startTime,
        end_time: payload.endTime,
        location: payload.location ?? null,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, ids: {} };
    }

    case "policy": {
      if (input.courseId == null) return { ok: false, error: "courseId is required to confirm a policy." };
      // Only late/attendance map to a real courses column -- grading/other policies have
      // no dedicated field in the schema yet and are intentionally not written anywhere;
      // the extraction is still marked confirmed for audit history.
      const column = payload.kind === "late" ? "late_policy" : payload.kind === "attendance" ? "attendance_policy" : null;
      if (column) {
        const { error } = await client.from("courses").update({ [column]: payload.text }).eq("id", input.courseId).eq("user_id", input.userId);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true, ids: {} };
    }
  }
}
