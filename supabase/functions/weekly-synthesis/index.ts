// Cron-triggered weekly synthesis -- L7 item 4. Same shape as nightly-analysis (see its
// own header comment): deterministic-first, model enrichment on top, honest degradation
// on any failure. Includes the brief's SYSTEM FAILURE section -- "important and easy to
// skip" -- which is why it's in the schema's required fields, not an optional extra.
//
// Not user-JWT-triggered (verify_jwt = false) -- gated by the same CRON_SHARED_SECRET
// header nightly-analysis uses.
//
// Body: {} processes every user, synthesizing the 7 days ending on each user's own
// last-completed local day. {userId, weekEndDate} reprocesses one specific user/week.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, handleCorsPreflight } from "../_shared/http.ts";
import { addDays, localDateFromInstant } from "../_shared/core/index.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { runWeeklySynthesisForUser, type WeeklySynthesisOutcome } from "../_shared/nightly/runWeeklySynthesis.ts";

const RequestBodySchema = z.object({
  userId: z.string().uuid().optional(),
  weekEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const MODEL = "claude-sonnet-5" as const;
const MAX_TOKENS = 3000; // weekly does deeper reasoning than nightly -- more room to reason

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  if (!cronSecret) return apiErr("Server misconfigured: CRON_SHARED_SECRET not set.", 500);
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return apiErr("Invalid or missing cron secret.", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return apiErr("Server misconfigured: missing Supabase service-role environment.", 500);
  }
  const client = createClient(supabaseUrl, serviceRoleKey);

  let body: unknown = {};
  const rawBody = await req.text();
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return apiErr("Malformed JSON body.", 400);
    }
  }
  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request body: ${parsed.error.message}`, 400);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const provider = apiKey ? createAnthropicProvider(apiKey) : null;
  const now = () => new Date();

  const targets: Array<{ userId: string; weekEndDate: string }> = [];

  if (parsed.data.userId) {
    let weekEndDate = parsed.data.weekEndDate;
    if (!weekEndDate) {
      const { data: profile, error } = await client.from("profiles").select("timezone").eq("id", parsed.data.userId).single();
      if (error) return apiErr(`Unknown user: ${error.message}`, 404);
      weekEndDate = addDays(localDateFromInstant(now(), profile.timezone), -1);
    }
    targets.push({ userId: parsed.data.userId, weekEndDate });
  } else {
    const { data: profiles, error } = await client.from("profiles").select("id, timezone");
    if (error) return apiErr(`Failed to load profiles: ${error.message}`, 500);
    for (const profile of profiles ?? []) {
      targets.push({ userId: profile.id, weekEndDate: addDays(localDateFromInstant(now(), profile.timezone), -1) });
    }
  }

  const outcomes: WeeklySynthesisOutcome[] = [];
  const failures: Array<{ userId: string; weekEndDate: string; error: string }> = [];

  for (const target of targets) {
    try {
      const outcome = await runWeeklySynthesisForUser({ client, provider, model: MODEL, maxTokens: MAX_TOKENS, now }, target.userId, target.weekEndDate);
      outcomes.push(outcome);
    } catch (err) {
      failures.push({ userId: target.userId, weekEndDate: target.weekEndDate, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return apiOk({ processed: outcomes.length, outcomes, failures });
});
