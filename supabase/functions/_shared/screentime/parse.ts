// Orchestrates one weekly Screen Time parse: a screenshot -> the LLM gateway (vision) ->
// staged rows in screen_time_extractions. Nothing here ever writes screen_time_weeks --
// that only ever happens through an explicit user confirmation (packages/api's
// confirmScreenTimeWeek), which is the point of the whole design and the same
// extract.ts/confirm.ts split the syllabus pipeline established.
//
// D9: this file never talks to a provider. It composes callLlm, and the budget gate,
// the forced tool call and the Zod validation are all unbypassable as a result.
//
// D10, the no-guessing rule, is the reason this file is longer than it looks like it
// should be. Three separate things become "a field the user fills" rather than a number:
// a value the model returned as null, a value it returned with low confidence, and the
// week's daily average when the model did not report one at all. An invented number is
// indistinguishable from a read one the moment it is confirmed, so none of the three is
// ever filled in here.
//
// NOT live-tested in this environment (no ANTHROPIC_API_KEY). The pieces it composes are
// each tested in isolation; this function's own logic -- the staging shape, the
// confidence floor, the synthesised total -- is tested in parse.test.ts against a fake
// client and the fixture provider.

import { z } from "zod";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";
import type { LlmImage } from "../llm/types.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

// Haiku, per SUPABASE_SETUP.md §7's model-per-call-type table: reading printed numbers
// off a screenshot is structured extraction, not reasoning, and this runs once a week.
// The falsifier is specific: if Haiku misreads the small per-app durations often enough
// that the confirm step becomes retyping rather than checking, escalate this one call to
// Sonnet -- the cost of a weekly image call is not what makes this decision.
const SCREEN_TIME_MODEL = "claude-haiku-4-5" as const;
const SCREEN_TIME_MAX_TOKENS = 2048;

/**
 * A conservative pre-flight token estimate for one screenshot.
 *
 * Anthropic bills an image at roughly (width x height) / 750 tokens; a full-height iPhone
 * screenshot lands near 1,600. There is no way to know the real dimensions before the
 * call, and the budget gate must never UNDER-estimate (an underestimate lets a call
 * through that crosses the ceiling), so this deliberately overshoots.
 */
const ESTIMATED_IMAGE_TOKENS = 2_500;

/**
 * Below this, a returned number is discarded and the row becomes a field the user fills.
 *
 * This is the no-guessing rule applied to the case that actually happens with a
 * screenshot: the model does not usually say "I cannot read this", it says "47" with low
 * confidence about a blurry "17". A number nobody can stand behind is worse than an empty
 * box, because the empty box gets looked at and the number gets confirmed.
 */
const CONFIDENCE_FLOOR = 0.6;

/**
 * How many breakdown rows are staged. The confirm UI is a list of fields a person reads
 * one by one on a Sunday; a 40-row list is not a review, it is a data-entry shift. The
 * total is never one of the dropped rows -- it is extracted before this cap applies.
 */
const MAX_BREAKDOWN_ROWS = 12;

const SYSTEM_PROMPT = `You read one iOS Screen Time screenshot and report the numbers printed on it.

Report:
- itemType "total": the WEEKLY DAILY AVERAGE the screenshot shows ("Daily Average"). Exactly one.
- itemType "category": each category row (Social, Entertainment, Productivity & Finance, ...).
- itemType "app": each individual app row, if the screenshot shows them.

Rules:
- minutes is always a whole number of MINUTES. "2h 14m" is 134. "48m" is 48. "1h" is 60.
- Report ONLY what is printed. Never total the categories yourself, never scale a daily
  figure into a weekly one, and never estimate a bar's height into a number.
- If a value is cut off, blurred, or you are not certain what it reads, set minutes to
  null and give a low confidence. A null is the correct answer for an unreadable value —
  the person who took the screenshot will fill it in. Do NOT guess.
- confidence is your own 0-1 certainty about that specific number.
- sourceSnippet is the text as it appears on screen ("2h 14m"), so the person can check
  your reading against the picture.
- If this image is not an iOS Screen Time screenshot at all, set notScreenTime to true and
  return an empty items list.`;

export const ScreenTimeItemSchema = z.object({
  itemType: z.enum(["total", "category", "app"]),
  label: z.string().nullable(),
  minutes: z.number().int().min(0).max(10_080).nullable(),
  confidence: z.number().min(0).max(1),
  sourceSnippet: z.string().nullable(),
});

export const ScreenTimeParseResultSchema = z.object({
  items: z.array(ScreenTimeItemSchema),
  notScreenTime: z.boolean(),
});

export type ScreenTimeParseResult = z.infer<typeof ScreenTimeParseResultSchema>;

/**
 * The real tool input_schema, hand-written to mirror the Zod schema above rather than a
 * `{type:"object"}` stub. The syllabus path shipped with a stub and paid for it live: the
 * model returned complete data under its own invented key names. New call sites start
 * strict -- parse.ts (announcements) set that precedent and this follows it.
 */
const SCREEN_TIME_TOOL_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemType: { enum: ["total", "category", "app"] },
          label: { type: ["string", "null"] },
          minutes: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 10080,
            description: "Whole minutes. null when the value cannot be read with confidence — never a guess.",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          sourceSnippet: { type: ["string", "null"] },
        },
        required: ["itemType", "label", "minutes", "confidence", "sourceSnippet"],
        additionalProperties: false,
      },
    },
    notScreenTime: { type: "boolean" },
  },
  required: ["items", "notScreenTime"],
  additionalProperties: false,
};

export type ParseScreenTimeResult =
  | { kind: "staged"; uploadId: number; itemCount: number; needsInputCount: number }
  | { kind: "notScreenTime"; reason: string }
  | { kind: "budgetExceeded" }
  | { kind: "parseFailed"; reason: string };

export interface ParseScreenTimeInput {
  uploadId: number;
  userId: string;
  budgetCeilingUsd: number;
  image: LlmImage;
}

interface StagedRow {
  user_id: string;
  upload_id: number;
  item_type: "total" | "category" | "app";
  label: string | null;
  minutes: number | null;
  needs_input: boolean;
  confidence: number | null;
  source_snippet: string | null;
  status: "pending";
}

/**
 * One item as the schema will accept it.
 *
 * The invariant this function exists to hold is migration 64's
 * `screen_time_extractions_value_or_prompt`: `(minutes is not null) <> needs_input`. A row
 * is either a number or a question, never both and never neither. Everything that would
 * have produced a half-confident number instead produces a question.
 */
function toStagedRow(
  item: ScreenTimeParseResult["items"][number],
  input: ParseScreenTimeInput,
): StagedRow {
  const readable = item.minutes != null && item.confidence >= CONFIDENCE_FLOOR;
  return {
    user_id: input.userId,
    upload_id: input.uploadId,
    item_type: item.itemType,
    label: item.label,
    // Deliberately dropped rather than kept alongside `needs_input` — a discarded reading
    // must not sit in the column the confirm step reads, or the "empty field" would arrive
    // pre-filled with the very number nobody could stand behind.
    minutes: readable ? item.minutes : null,
    needs_input: !readable,
    confidence: item.confidence,
    source_snippet: item.sourceSnippet,
    status: "pending",
  };
}

/**
 * Stages one screenshot's reading.
 *
 * The staged set ALWAYS contains exactly one `total` row, even when the model reported
 * none: the weekly daily average is the one number the series is made of, and its absence
 * has to become a field on the confirm screen rather than a failed parse. Refusing the
 * whole upload because one line was unreadable would throw away a correct reading of the
 * other twelve — and would teach someone that uploading is risky.
 */
export async function parseScreenTime(
  client: AnySupabaseClient,
  gatewayDeps: GatewayDeps,
  input: ParseScreenTimeInput,
): Promise<ParseScreenTimeResult> {
  const result = await callLlm(gatewayDeps, {
    userId: input.userId,
    callType: "screen_time_parse",
    model: SCREEN_TIME_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    userContent:
      "Read this iOS Screen Time screenshot. Report the weekly daily average and every category " +
      "and app row you can see. Leave minutes null for anything you cannot read with confidence.",
    images: [input.image],
    toolName: "emit_screen_time_reading",
    toolInputSchema: SCREEN_TIME_TOOL_INPUT_SCHEMA,
    maxTokens: SCREEN_TIME_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: ScreenTimeParseResultSchema,
    estimatedInputTokens: ESTIMATED_IMAGE_TOKENS,
  });

  if (result.kind === "budgetExceeded") {
    await failUpload(client, input.uploadId, "Monthly LLM budget exceeded.");
    return { kind: "budgetExceeded" };
  }
  if (result.kind === "deterministicFallback") {
    await failUpload(client, input.uploadId, result.reason);
    return { kind: "parseFailed", reason: result.reason };
  }

  if (result.data.notScreenTime) {
    const reason = "That image does not look like an iOS Screen Time screenshot.";
    await failUpload(client, input.uploadId, reason);
    return { kind: "notScreenTime", reason };
  }

  // The first `total` wins. A second one is the model reporting the same number twice
  // under two labels, not two different weeks — and picking one is better than staging a
  // contradiction the user has to adjudicate.
  const totalItem = result.data.items.find((item) => item.itemType === "total") ?? null;
  const breakdown = result.data.items
    .filter((item) => item.itemType !== "total")
    .slice(0, MAX_BREAKDOWN_ROWS);

  const totalRow: StagedRow =
    totalItem != null
      ? toStagedRow(totalItem, input)
      : {
          user_id: input.userId,
          upload_id: input.uploadId,
          item_type: "total",
          label: "Daily average",
          minutes: null,
          needs_input: true,
          confidence: null,
          source_snippet: null,
          status: "pending",
        };

  const rows: StagedRow[] = [totalRow, ...breakdown.map((item) => toStagedRow(item, input))];

  const { error } = await client.from("screen_time_extractions").insert(rows);
  if (error) {
    await failUpload(client, input.uploadId, error.message);
    return { kind: "parseFailed", reason: error.message };
  }

  await client
    .from("screen_time_uploads")
    .update({ status: "parsed", error_message: null })
    .eq("id", input.uploadId);

  return {
    kind: "staged",
    uploadId: input.uploadId,
    itemCount: rows.length,
    needsInputCount: rows.filter((row) => row.needs_input).length,
  };
}

async function failUpload(client: AnySupabaseClient, uploadId: number, message: string): Promise<void> {
  await client
    .from("screen_time_uploads")
    .update({ status: "failed", error_message: message })
    .eq("id", uploadId);
}
