// Triggers one weekly Screen Time parse (D51): downloads the uploaded screenshot,
// base64-encodes it, runs it through the LLM gateway's budget gate + forced tool call +
// Zod validation, and stages the reading in screen_time_extractions (status='pending').
//
// Nothing here ever writes screen_time_weeks. That table has exactly one writer --
// packages/api's confirmScreenTimeWeek, called from a confirm gesture -- which is the
// same one-path-to-done split syllabus-extract/syllabus-confirm established, and is where
// D10 ("extraction never auto-writes; a person confirms") is actually enforced.
//
// Structure follows supabase/functions/syllabus-extract/index.ts line for line: preflight,
// method check, verified caller, Zod-validated body, ownership-scoped upload lookup,
// storage download, key check, gateway deps, one shared orchestrator, a result switch.
// The one real difference is the input: a Screen Time screenshot is a PICTURE, so instead
// of extracting text from the downloaded bytes this hands them to the gateway as an image
// (LlmToolCallRequest.images) -- the same download-from-a-private-bucket path the syllabus
// upload already uses for its image uploads, with the vision content block added.
//
// JWT verification: on (config.toml's [functions.screen-time-parse] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip -- see _shared/http.ts).
//
// No ANTHROPIC_API_KEY exists in this environment -- everything up to the model call is
// exercised for real, and the call itself needs the live smoke test that
// docs/SUPABASE_SETUP.md already tracks.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import type { LlmImage } from "../_shared/llm/types.ts";
import { parseScreenTime } from "../_shared/screentime/parse.ts";

const RequestSchema = z.object({
  uploadId: z.number().int().positive(),
});

/** The bucket the screenshot lives in — kept in step with packages/api's
 *  SCREEN_TIME_BUCKET, which explains why it is the syllabi bucket and not one of its
 *  own (migration 64 defines no bucket and the migrations are settled). */
const SCREEN_TIME_BUCKET = "syllabi";

/** Base64 in fixed-size chunks. `String.fromCharCode(...bytes)` on a whole multi-megabyte
 *  screenshot blows the argument limit and throws a RangeError -- a crash that would read
 *  as "parsing is broken" rather than "that image is large". */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Only the two formats the bucket accepts. An unknown extension is refused rather than
 *  guessed at: sending the API a media type the bytes are not produces an opaque 400. */
function mediaTypeFor(storagePath: string, blobType: string): LlmImage["mediaType"] | null {
  // The declared type first, the path's extension as the fallback — some storage responses come
  // back as application/octet-stream, and refusing a perfectly good .png over a vague header would
  // be a refusal the user cannot act on.
  for (const candidate of [blobType.toLowerCase(), storagePath.toLowerCase()]) {
    if (candidate.includes("png")) return "image/png";
    if (candidate.includes("jpeg") || candidate.includes("jpg")) return "image/jpeg";
  }
  return null;
}

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
    return apiErr(
      `Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      400,
    );
  }

  const { client, userId } = caller;

  const { data: upload, error: uploadError } = await client
    .from("screen_time_uploads")
    .select("id, storage_path, status, week_start_date")
    .eq("id", parsed.data.uploadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (uploadError) return apiErr(uploadError.message, 500);
  if (!upload) return apiErr("Upload not found.", 404);
  if (upload.status === "confirmed") {
    // Re-parsing a confirmed week would stage a second reading of a number the user has
    // already stood behind. Re-uploading the week is the supported way to redo it.
    return apiErr(`The week of ${upload.week_start_date} has already been confirmed.`, 409);
  }

  const { data: fileBlob, error: downloadError } = await client.storage
    .from(SCREEN_TIME_BUCKET)
    .download(upload.storage_path);
  if (downloadError || !fileBlob) {
    return apiErr(`Could not read the uploaded screenshot: ${downloadError?.message ?? "unknown error"}.`, 500);
  }

  const mediaType = mediaTypeFor(upload.storage_path, fileBlob.type);
  if (mediaType == null) {
    return apiErr("That file is not a PNG or JPEG screenshot.", 422);
  }

  const image: LlmImage = {
    mediaType,
    dataBase64: toBase64(new Uint8Array(await fileBlob.arrayBuffer())),
  };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("llm_monthly_budget_usd")
    .eq("id", userId)
    .single();
  if (profileError) return apiErr(profileError.message, 500);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    // A real, honest failure mode -- not a crash, not a silently-empty success. The
    // surface relays this sentence as-is and offers manual entry instead.
    console.log(`[screen-time-parse] no ANTHROPIC_API_KEY configured; refusing upload ${upload.id}`);
    return apiErr("Screenshot reading is not yet configured on this server (no Anthropic API key).", 503);
  }

  const gatewayDeps: GatewayDeps = {
    provider: createAnthropicProvider(apiKey),
    getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
    logUsage: (entry) => logUsage(client, entry),
    now: () => new Date(),
  };

  const result = await parseScreenTime(client, gatewayDeps, {
    uploadId: upload.id,
    userId,
    budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
    image,
  });

  switch (result.kind) {
    case "staged":
      return apiOk(result);
    case "notScreenTime":
      return apiErr(result.reason, 422);
    case "budgetExceeded":
      return apiErr("Monthly LLM budget exceeded.", 402);
    case "parseFailed":
      return apiErr(result.reason, 502);
  }
});
