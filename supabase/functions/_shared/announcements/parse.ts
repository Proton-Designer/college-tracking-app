// Orchestrates one announcement parse: raw pasted text + the course's current
// deliverables as context -> LLM gateway -> staged diff on the announcements row.
// Nothing here writes to deliverables -- that is announcement-confirm's job alone,
// the same one-path-to-done split extract.ts/confirm.ts established for syllabi.

import { z } from "zod";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

// Haiku per SUPABASE_SETUP.md §7's model-per-call-type table: deadline change detection
// is "trivial classification" -- and the call type existed in LlmCallType before this
// feature did, which is why this file invents nothing.
const ANNOUNCEMENT_MODEL = "claude-haiku-4-5" as const;
const ANNOUNCEMENT_MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You read one college course announcement (posted by a professor)
and extract every schedulable change as a structured diff against the course's existing
items, which are provided as context.

Change kinds:
- date_change: an existing item's due date moved. Match it to the provided item list by
  title; put the EXACT title you matched in matchedTitle. Give the new date as YYYY-MM-DD
  when the announcement states it unambiguously; otherwise put the verbatim date text in
  newDueText and leave newDueDate null -- never guess a real date.
- new_item: something new with a deadline (a quiz added, an extra credit assignment).
- note: a requirement change with no date ("bring a printed formula sheet").

For every change include the verbatim sentence it came from (sourceSnippet). If the
announcement contains nothing schedulable -- encouragement, reminders of unchanged dates,
logistics -- set noSchedulableContent true and return an empty changes list. Do not
manufacture changes from restatements of existing dates.`;

export const AnnouncementChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("date_change"),
    matchedTitle: z.string().min(1),
    newDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    newDueText: z.string().nullable(),
    sourceSnippet: z.string().min(1),
  }),
  z.object({
    kind: z.literal("new_item"),
    title: z.string().min(1),
    itemType: z.enum(["paper", "report", "problem_set", "exam", "project", "reading", "quiz", "post", "admin"]),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dueText: z.string().nullable(),
    sourceSnippet: z.string().min(1),
  }),
  z.object({
    kind: z.literal("note"),
    text: z.string().min(1),
    sourceSnippet: z.string().min(1),
  }),
]);

export const AnnouncementParseResultSchema = z.object({
  changes: z.array(AnnouncementChangeSchema),
  noSchedulableContent: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type AnnouncementParseResult = z.infer<typeof AnnouncementParseResultSchema>;

/**
 * The real JSON Schema for the tool's input_schema -- hand-written to mirror the Zod
 * schema above, NOT a `{type:"object"}` stub. The syllabus path shipped with a stub
 * because no key existed to verify a real schema against; the live smoke test has since
 * proven the API honors a full schema with forced tool_choice, so new call sites start
 * strict. (The syllabus stub's replacement is tracked as its own task.)
 */
const TOOL_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "date_change" },
              matchedTitle: { type: "string", minLength: 1 },
              newDueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              newDueText: { type: ["string", "null"] },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["kind", "matchedTitle", "newDueDate", "newDueText", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "new_item" },
              title: { type: "string", minLength: 1 },
              itemType: {
                enum: ["paper", "report", "problem_set", "exam", "project", "reading", "quiz", "post", "admin"],
              },
              dueDate: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
              dueText: { type: ["string", "null"] },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["kind", "title", "itemType", "dueDate", "dueText", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "note" },
              text: { type: "string", minLength: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["kind", "text", "sourceSnippet"],
            additionalProperties: false,
          },
        ],
      },
    },
    noSchedulableContent: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["changes", "noSchedulableContent", "confidence"],
  additionalProperties: false,
};

export type ParseAnnouncementResult =
  | { kind: "parsed"; announcementId: number; changeCount: number }
  | { kind: "noSchedulableContent"; announcementId: number }
  | { kind: "budgetExceeded" }
  | { kind: "parseFailed"; reason: string };

export interface CourseItemContext {
  title: string;
  dueDate: string;
  type: string;
}

/** The user content: the announcement plus the course's items, so date_change matching
 *  happens against real titles rather than the model's imagination. */
function buildUserContent(rawText: string, items: CourseItemContext[]): string {
  const itemLines =
    items.length > 0
      ? items.map((i) => `- ${i.title} (${i.type}, due ${i.dueDate})`).join("\n")
      : "(none on record)";
  return `COURSE ITEMS ON RECORD:\n${itemLines}\n\nANNOUNCEMENT:\n${rawText}`;
}

export async function parseAnnouncement(
  client: AnySupabaseClient,
  gatewayDeps: GatewayDeps,
  input: {
    announcementId: number;
    userId: string;
    budgetCeilingUsd: number;
    rawText: string;
    courseItems: CourseItemContext[];
  },
): Promise<ParseAnnouncementResult> {
  const result = await callLlm(gatewayDeps, {
    userId: input.userId,
    callType: "deadline_change_detection",
    model: ANNOUNCEMENT_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    userContent: buildUserContent(input.rawText, input.courseItems),
    toolName: "emit_announcement_diff",
    toolInputSchema: TOOL_INPUT_SCHEMA,
    maxTokens: ANNOUNCEMENT_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: AnnouncementParseResultSchema,
    estimatedInputTokens: Math.ceil((input.rawText.length + 200 * input.courseItems.length) / 4),
  });

  if (result.kind === "budgetExceeded") {
    await client
      .from("announcements")
      .update({ status: "failed", failure_reason: "Monthly LLM budget exceeded." })
      .eq("id", input.announcementId);
    return { kind: "budgetExceeded" };
  }
  if (result.kind === "deterministicFallback") {
    await client
      .from("announcements")
      .update({ status: "failed", failure_reason: result.reason })
      .eq("id", input.announcementId);
    return { kind: "parseFailed", reason: result.reason };
  }

  const parsed: AnnouncementParseResult = result.data;

  if (parsed.noSchedulableContent || parsed.changes.length === 0) {
    // A real, common outcome -- filed to the course, not an error. 5.2's own words.
    await client
      .from("announcements")
      .update({ status: "no_schedulable_content", parse_confidence: parsed.confidence })
      .eq("id", input.announcementId);
    return { kind: "noSchedulableContent", announcementId: input.announcementId };
  }

  const { error } = await client
    .from("announcements")
    .update({
      status: "parsed",
      parsed_diff: { changes: parsed.changes },
      parse_confidence: parsed.confidence,
    })
    .eq("id", input.announcementId);
  if (error) return { kind: "parseFailed", reason: error.message };

  return { kind: "parsed", announcementId: input.announcementId, changeCount: parsed.changes.length };
}
