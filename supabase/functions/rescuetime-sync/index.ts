// Connects (first call) and syncs RescueTime's Daily Summary Feed -- JWT-verified, the
// caller is a real user syncing their own account, same trust model as
// brightspace-sync/whoop-oauth-callback. Body: {} re-syncs using the already-stored API
// key. {apiKey} connects (or reconnects/rotates) the key first, then syncs -- one endpoint
// for both, mirroring brightspace-sync's own connect-or-resync shape.
//
// Thin wrapper around syncRescueTime (_shared/rescuetime) -- the real fetch/normalize/
// ingest logic is proven offline (realProvider.test.ts) and against the real local DB
// (ingest.itest.ts, syncHandler.itest.ts) before this handler ever runs it live.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { getRescueTimeApiKey, storeRescueTimeApiKey } from "../_shared/rescuetime/keyStore.ts";
import { createRescueTimeProvider } from "../_shared/rescuetime/realProvider.ts";
import { syncRescueTime } from "../_shared/rescuetime/syncHandler.ts";

const RequestSchema = z.object({ apiKey: z.string().min(1).optional() });

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  let body: unknown = {};
  const rawBody = await req.text();
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return apiErr("Malformed JSON body.", 400);
    }
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request body: ${parsed.error.message}`, 400);

  if (parsed.data.apiKey) {
    await storeRescueTimeApiKey(client, userId, parsed.data.apiKey);
  }

  const apiKey = await getRescueTimeApiKey(client, userId);
  if (!apiKey) return apiErr("No RescueTime API key connected yet -- pass apiKey to connect one.", 400);

  const provider = createRescueTimeProvider();

  try {
    const result = await syncRescueTime(client, provider, userId, apiKey);
    return apiOk(result);
  } catch (err) {
    return apiErr(`RescueTime sync failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
});
