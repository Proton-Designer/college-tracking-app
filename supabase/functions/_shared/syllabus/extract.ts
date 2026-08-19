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
    toolInputSchema: zodToJsonSchemaStub(),
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

// Placeholder: a real implementation generates a JSON Schema from SyllabusExtractionResultSchema
// (e.g. via zod-to-json-schema) for the Anthropic tool's input_schema. Deferred until a
// real key exists to verify the generated schema against the live API's expectations.
function zodToJsonSchemaStub(): Record<string, unknown> {
  return { type: "object" };
}

export type { z };
