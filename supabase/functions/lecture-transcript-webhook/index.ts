// Deepgram's callback receiver -- verify_jwt OFF; the per-row webhook_token in the URL
// is the auth (see _shared/lectures/deepgram.ts's header for why possession-of-URL is
// the strongest channel Deepgram offers). Idempotent by the status gate: a replay
// against a settled row is acknowledged and changes nothing.

import { createClient } from "npm:@supabase/supabase-js@2";
import { apiErr, apiOk, handleCorsPreflight } from "../_shared/http.ts";
import { parseDeepgramCallback } from "../_shared/lectures/deepgram.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length < 32) return apiErr("Missing callback token.", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return apiErr("Server misconfigured.", 500);
  const service = createClient(supabaseUrl, serviceRoleKey);

  const { data: row, error: rowError } = await service
    .from("lecture_transcripts")
    .select("id, status")
    .eq("webhook_token", token)
    .maybeSingle();
  if (rowError) return apiErr(rowError.message, 500);
  // An unknown token gets the same 401 as a missing one -- nothing to probe.
  if (row == null) return apiErr("Unknown callback token.", 401);
  if (row.status !== "processing") return apiOk({ alreadySettled: true });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErr("Callback body must be JSON.", 400);
  }

  const parsed = parseDeepgramCallback(body);
  if (parsed.kind === "failed") {
    const { error } = await service
      .from("lecture_transcripts")
      .update({ status: "failed", failure_reason: parsed.reason, deepgram_request_id: parsed.requestId })
      .eq("id", row.id);
    if (error) return apiErr(error.message, 500);
    return apiOk({ stored: "failed" });
  }

  const { error: updateError } = await service
    .from("lecture_transcripts")
    .update({
      status: "ready",
      transcript: parsed.transcript,
      segments: parsed.segments,
      failure_reason: null,
    })
    .eq("id", row.id);
  if (updateError) return apiErr(updateError.message, 500);

  return apiOk({ stored: "ready" });
});
