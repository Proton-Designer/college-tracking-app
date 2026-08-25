// Orchestrates one syllabus extraction call: PDF text -> quality gate -> LLM gateway ->
// staging write. NOT live-tested in this environment (no ANTHROPIC_API_KEY) -- the
// pieces it composes (textQuality.ts, the gateway, the Zod schemas) are each tested in
// isolation; this function's own logic (the staging write shape) is tested in
// extract.test.ts against a fake client and a fake gateway call.

import { z } from "zod";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";
import { assessExtractedText } from "./textQuality.ts";
import { SyllabusExtractionResultSchema, type SyllabusExtractionResult } from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

const SYLLABUS_EXTRACTION_MODEL = "claude-haiku-4-5" as const;
const SYLLABUS_EXTRACTION_MAX_TOKENS = 4096;

const SYSTEM_PROMPT = `You extract structured information from a college course syllabus.
Extract every dated item (assignment, exam), every grading category and its weight,
office hours, and late/attendance policies. For every item, include the verbatim
sentence(s) of source text it came from, and your own confidence (0-1). If a date is
relative or unclear ("during finals week", "TBD"), extract it as-is and let the
confirmation step resolve it -- do not guess a real date. If the source text looks too
sparse or garbled to extract from reliably, set lowQualitySourceText to true and return
an empty items list rather than inventing content.`;

export type ExtractSyllabusResult =
  | { kind: "staged"; uploadId: number; itemCount: number }
  | { kind: "textTooLowQuality"; reason: string }
  | { kind: "budgetExceeded" }
  | { kind: "extractionFailed"; reason: string };

export async function extractSyllabus(
  client: AnySupabaseClient,
  gatewayDeps: GatewayDeps,
  input: { uploadId: number; userId: string; budgetCeilingUsd: number; extractedText: string },
): Promise<ExtractSyllabusResult> {
  const quality = assessExtractedText(input.extractedText);
  if (!quality.ok) {
    await client.from("syllabus_uploads").update({ extraction_status: "failed", failure_reason: quality.reason }).eq("id", input.uploadId);
    return { kind: "textTooLowQuality", reason: quality.reason! };
  }

  const result = await callLlm(gatewayDeps, {
    userId: input.userId,
    callType: "syllabus_extraction",
    model: SYLLABUS_EXTRACTION_MODEL,
    systemPrompt: SYSTEM_PROMPT,
    userContent: input.extractedText,
    toolName: "emit_syllabus_extraction",
    toolInputSchema: SYLLABUS_TOOL_INPUT_SCHEMA,
    maxTokens: SYLLABUS_EXTRACTION_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: SyllabusExtractionResultSchema,
    estimatedInputTokens: Math.ceil(input.extractedText.length / 4),
  });

  if (result.kind === "budgetExceeded") {
    await client.from("syllabus_uploads").update({ extraction_status: "failed", failure_reason: "Monthly LLM budget exceeded." }).eq("id", input.uploadId);
    return { kind: "budgetExceeded" };
  }
  if (result.kind === "deterministicFallback") {
    await client.from("syllabus_uploads").update({ extraction_status: "failed", failure_reason: result.reason }).eq("id", input.uploadId);
    return { kind: "extractionFailed", reason: result.reason };
  }

  const extraction: SyllabusExtractionResult = result.data;
  if (extraction.lowQualitySourceText) {
    await client.from("syllabus_uploads").update({ extraction_status: "failed", failure_reason: "Model reported the source text was too sparse/garbled to extract reliably." }).eq("id", input.uploadId);
    return { kind: "textTooLowQuality", reason: "Model reported low-quality source text." };
  }

  // Every item lands in staging with status='pending' -- see confirm.ts for the only
  // path that ever promotes one into a real table.
  const rows = extraction.items.map((item) => ({
    user_id: input.userId,
    upload_id: input.uploadId,
    item_type: item.itemType,
    extracted_payload: item.payload,
    extraction_confidence: item.confidence,
    source_snippet: item.sourceSnippet,
    status: "pending",
  }));

  if (rows.length > 0) {
    const { error } = await client.from("syllabus_extractions").insert(rows);
    if (error) return { kind: "extractionFailed", reason: error.message };
  }

  await client.from("syllabus_uploads").update({ extraction_status: "completed" }).eq("id", input.uploadId);
  return { kind: "staged", uploadId: input.uploadId, itemCount: rows.length };
}

/**
 * The real tool input_schema. First live run (2026-08-25) proved the hard way that the
 * payload key contract CANNOT be left open here: with `payload: {type:"object"}`, the
 * model returned complete data under its own invented names (exam_name, category_name,
 * weight_percent, due_date) -- rich extractions the display and confirm.ts's per-type
 * Zod schemas could not read, staged at 0.99 confidence with every text field "missing".
 * The key names live in types.ts's payload schemas, and NOTHING else communicates them
 * to the model -- not the system prompt, not the gateway's pass-through Zod. So the wire
 * schema is where the contract must be stated: each itemType is correlated with its
 * exact payload shape, mirrored field-for-field from types.ts. If types.ts changes, this
 * must change with it -- they are one contract written twice, and confirm.ts's
 * re-validation is the guard that catches drift.
 */
const SYLLABUS_TOOL_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        oneOf: [
          {
            type: "object",
            properties: {
              itemType: { const: "course_info" },
              payload: {
                type: "object",
                properties: {
                  code: { type: "string", minLength: 1 },
                  name: { type: "string", minLength: 1 },
                  professorName: { type: "string" },
                  professorContact: { type: "string" },
                  term: { type: "string", minLength: 1 },
                },
                required: ["code", "name", "term"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              itemType: { const: "assignment" },
              payload: {
                type: "object",
                properties: {
                  title: { type: "string", minLength: 1 },
                  type: { enum: ["paper", "report", "problem_set", "exam", "project", "reading"] },
                  dueDate: { type: "string", minLength: 1 },
                  isDateApproximate: { type: "boolean" },
                  estimatedMinutes: { type: "integer", minimum: 1 },
                  gradeCategoryName: { type: "string" },
                },
                required: ["title", "type", "dueDate"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              itemType: { const: "exam" },
              payload: {
                type: "object",
                properties: {
                  title: { type: "string", minLength: 1 },
                  date: { type: "string", minLength: 1 },
                  isDateApproximate: { type: "boolean" },
                  location: { type: "string" },
                  gradeCategoryName: { type: "string" },
                },
                required: ["title", "date"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              itemType: { const: "grade_category" },
              payload: {
                type: "object",
                properties: {
                  name: { type: "string", minLength: 1 },
                  weightPct: { type: "number", minimum: 0, maximum: 100 },
                  dropLowestN: { type: "integer", minimum: 0 },
                  expectedItemCount: { type: "integer", minimum: 0 },
                },
                required: ["name", "weightPct"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              itemType: { const: "policy" },
              payload: {
                type: "object",
                properties: {
                  kind: { enum: ["late", "attendance", "grading", "other"] },
                  text: { type: "string", minLength: 1 },
                },
                required: ["kind", "text"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              itemType: { const: "office_hours" },
              payload: {
                type: "object",
                properties: {
                  dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
                  startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
                  endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
                  location: { type: "string" },
                },
                required: ["dayOfWeek", "startTime", "endTime"],
                additionalProperties: false,
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              sourceSnippet: { type: "string", minLength: 1 },
            },
            required: ["itemType", "payload", "confidence", "sourceSnippet"],
            additionalProperties: false,
          },
        ],
      },
    },
    lowQualitySourceText: { type: "boolean" },
  },
  required: ["items", "lowQualitySourceText"],
  additionalProperties: false,
};

export type { z };
