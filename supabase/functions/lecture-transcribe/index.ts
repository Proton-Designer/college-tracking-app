// Creates a lecture_transcripts row and submits the uploaded audio to Deepgram
// (LECTURE_CAPTURE_SPEC's architecture, verbatim): signed Storage URL out, webhook
// callback in. Fire-and-return -- the function never waits on transcription.
//
// JWT verification: ON (config.toml). Ownership is triple-gated: the caller's own RLS
// client reads the course, the storage path must sit under the caller's own id prefix,
// and the signed URL is created by the caller's client, which storage RLS scopes.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { submitToDeepgram } from "../_shared/lectures/deepgram.ts";

const RequestSchema = z.object({
  courseId: z.number().int().positive(),
  lectureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  storagePath: z.string().min(3).max(500),
});

/** 6 hours: Deepgram fetches the audio once, promptly; the URL just has to outlive a
 *  queue delay, not a semester. */
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErr("Request body must be valid JSON.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request: ${parsed.error.message}`, 400);

  const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
  if (!apiKey) return apiErr("Transcription is not configured on this server (no Deepgram key).", 503);

  if (!parsed.data.storagePath.startsWith(`${userId}/`)) {
    return apiErr("Storage path must sit under your own prefix.", 403);
  }

  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id")
    .eq("id", parsed.data.courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (courseError) return apiErr(courseError.message, 500);
  if (!course) return apiErr("That course could not be found.", 404);

  const { data: signed, error: signError } = await client.storage
    .from("lectures")
    .createSignedUrl(parsed.data.storagePath, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return apiErr(`Could not sign the audio file — was the upload completed? ${signError?.message ?? ""}`, 400);
  }

  const webhookToken = randomToken();
  const { data: row, error: insertError } = await client
    .from("lecture_transcripts")
    .insert({
      user_id: userId,
      course_id: parsed.data.courseId,
      lecture_date: parsed.data.lectureDate,
      storage_path: parsed.data.storagePath,
      webhook_token: webhookToken,
    })
    .select("id")
    .single();
  if (insertError) return apiErr(insertError.message, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const callbackUrl = `${supabaseUrl}/functions/v1/lecture-transcript-webhook?token=${webhookToken}`;
  const submit = await submitToDeepgram(apiKey, signed.signedUrl, callbackUrl);

  if (!submit.ok) {
    // The row records the failure rather than being deleted: a failed submit is a
    // state the user retries from, not one that silently never happened.
    await client
      .from("lecture_transcripts")
      .update({ status: "failed", failure_reason: submit.error })
      .eq("id", row.id)
      .eq("user_id", userId);
    return apiErr(`Transcription submit failed: ${submit.error}`, 502);
  }

  await client
    .from("lecture_transcripts")
    .update({ deepgram_request_id: submit.requestId })
    .eq("id", row.id)
    .eq("user_id", userId);

  return apiOk({ transcriptId: row.id, status: "processing" });
});
