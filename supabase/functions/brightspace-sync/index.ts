// Connects (first call) and syncs a Brightspace ICS feed: fetches the real feed URL
// (stored in Vault, never in a plaintext column -- see migration 0017), parses it, and
// stages every event into ics_event_extractions. Never writes to calendar_events
// directly -- that only happens through brightspace-confirm, same "one path to done"
// architecture as syllabus-confirm.
//
// JWT verification: config.toml's [functions.brightspace-sync] verify_jwt = true, plus
// the redundant getVerifiedCaller round-trip (see _shared/http.ts).
//
// Body: {} re-syncs the already-connected feed. {icsUrl} connects (or reconnects) a
// feed first, then syncs it -- one endpoint for both, since "sync" is meant to be
// safely re-callable and "connect" is just "sync, but store the URL first."

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { syncBrightspaceFeed } from "../_shared/brightspace/syncFeed.ts";

const RequestSchema = z.object({ icsUrl: z.string().url().optional() });

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

  if (parsed.data.icsUrl) {
    const { error: storeError } = await client.rpc("store_brightspace_feed_url", { p_user_id: userId, p_ics_url: parsed.data.icsUrl });
    if (storeError) return apiErr(`Failed to store feed URL: ${storeError.message}`, 500);
  }

  const { data: feedUrl, error: urlError } = await client.rpc("get_brightspace_feed_url", { p_user_id: userId });
  if (urlError) return apiErr(`Failed to read stored feed URL: ${urlError.message}`, 500);
  if (!feedUrl) return apiErr("No Brightspace feed connected yet -- pass icsUrl to connect one.", 400);

  const { data: feed, error: feedError } = await client.from("brightspace_feeds").select("id").eq("user_id", userId).single();
  if (feedError) return apiErr(`Failed to load feed record: ${feedError.message}`, 500);

  let icsText: string;
  try {
    const response = await fetch(feedUrl);
    if (!response.ok) return apiErr(`Fetching the Brightspace feed failed with status ${response.status}.`, 502);
    icsText = await response.text();
  } catch (err) {
    return apiErr(`Fetching the Brightspace feed failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }

  try {
    const result = await syncBrightspaceFeed(client, userId, feed.id, icsText);
    return apiOk(result);
  } catch (err) {
    return apiErr(`Sync failed: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});
