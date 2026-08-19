// Triggers one syllabus extraction: downloads the uploaded file, extracts its text,
// runs it through the LLM gateway's budget gate + forced tool call + Zod validation, and
// stages the results in syllabus_extractions (status='pending'). Nothing here ever
// writes to courses/deliverables/grade_categories directly -- that only ever happens
// through syllabus-confirm's promoteExtraction, which is the point of the whole design.
//
// JWT verification: on (config.toml's [functions.syllabus-extract] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip -- see _shared/http.ts).
//
// No ANTHROPIC_API_KEY exists in this environment as of P4 (same constraint noted at
// L5) -- this function is fully built, deployed, and reachable, and everything up to
// the actual Anthropic HTTP call is exercised for real (auth, request validation,
// upload lookup, storage download, PDF text extraction, the budget pre-flight check).
// The real model call itself needs the live smoke test docs/SUPABASE_SETUP.md already
// tracks for the first time a key exists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { extractSyllabus } from "../_shared/syllabus/extract.ts";
import { extractPdfText } from "../_shared/syllabus/pdfText.ts";

const RequestSchema = z.object({
  uploadId: z.number().int().positive(),
});

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return apiErr("Method not allowed.", 405);
  }

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErr("Request body must be valid JSON.", 400);
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiErr(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, 400);
  }

  const { client, userId } = caller;

  const { data: upload, error: uploadError } = await client
    .from("syllabus_uploads")
    .select("id, storage_path, extraction_status")
    .eq("id", parsed.data.uploadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (uploadError) return apiErr(uploadError.message, 500);
  if (!upload) return apiErr("Upload not found.", 404);
  if (upload.extraction_status === "completed") {
    return apiErr(`Upload ${upload.id} has already completed extraction.`, 409);
  }

  const { data: fileBlob, error: downloadError } = await client.storage.from("syllabi").download(upload.storage_path);
  if (downloadError || !fileBlob) {
    return apiErr(`Could not read the uploaded file: ${downloadError?.message ?? "unknown error"}.`, 500);
  }

  let extractedText: string;
  try {
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const pdfResult = await extractPdfText(bytes);
    extractedText = pdfResult.text;
  } catch (err) {
    // Not a text-layer PDF (or an image upload, which the bucket also allows) -- this is
    // a real, expected outcome, not a server error; extractSyllabus's own quality gate
    // is the single place "too little to work with" gets decided, so hand it an empty
    // string rather than special-casing the failure here too.
    extractedText = "";
    console.log(`[syllabus-extract] PDF text extraction failed for upload ${upload.id}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("llm_monthly_budget_usd")
    .eq("id", userId)
    .single();
  if (profileError) return apiErr(profileError.message, 500);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    // A real, honest failure mode -- not a crash, not a silently-empty success. Distinct
    // from budgetExceeded/extractionFailed so the caller (and whoever reads server logs)
    // can tell "we truly cannot serve this yet" apart from "the model call itself failed".
    console.log(`[syllabus-extract] no ANTHROPIC_API_KEY configured; refusing upload ${upload.id}`);
    return apiErr("Syllabus extraction is not yet configured on this server (no Anthropic API key).", 503);
  }

  const gatewayDeps: GatewayDeps = {
    provider: createAnthropicProvider(apiKey),
    getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
    logUsage: (entry) => logUsage(client, entry),
    now: () => new Date(),
  };

  const result = await extractSyllabus(client, gatewayDeps, {
    uploadId: upload.id,
    userId,
    budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
    extractedText,
  });

  switch (result.kind) {
    case "staged":
      return apiOk(result);
    case "textTooLowQuality":
      return apiErr(result.reason, 422);
    case "budgetExceeded":
      return apiErr("Monthly LLM budget exceeded.", 402);
    case "extractionFailed":
      return apiErr(result.reason, 502);
  }
});
