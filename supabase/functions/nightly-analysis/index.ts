// Cron-triggered nightly report generation -- L7. Always produces a real, stored report
// for every user: assembles + stores the deterministic report and daily summary first
// (unconditionally), then attempts model enrichment via the gateway, degrading honestly
// on any failure. See _shared/nightly/runNightlyAnalysis.ts for the actual ordering
// guarantee and its golden-fixture proof.
//
// Not user-JWT-triggered (verify_jwt = false in config.toml) -- this runs for every user
// in one invocation, driven by pg_cron/pg_net (see docs/SUPABASE_SETUP.md's cron
// section), authenticated by a shared secret header instead of a session token.
//
// Body: {} (or omitted) processes every user, computing each one's own last-completed
// local day from their profile timezone -- never a hardcoded UTC date, since "today" is
// a different instant for every user (CLAUDE.md's timezone rule). {userId, localDate}
// reprocesses one specific user/night -- the manual retrigger / cloud-verification path.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, handleCorsPreflight } from "../_shared/http.ts";
import { addDays, localDateFromInstant } from "../_shared/core/index.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { runNightlyAnalysisForUser, type NightlyAnalysisOutcome } from "../_shared/nightly/runNightlyAnalysis.ts";

const RequestBodySchema = z.object({
  userId: z.string().uuid().optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const MODEL = "claude-sonnet-5" as const;
const MAX_TOKENS = 2000;

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

  // No ANTHROPIC_API_KEY tonight, in this environment -- the deterministic path is what
  // actually runs (see runNightlyAnalysis.ts's own comment). This is not a fallback
  // branch to be tested less; it's the branch the golden-fixture and completeness tests
  // both exercise directly.
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const provider = apiKey ? createAnthropicProvider(apiKey) : null;
  const now = () => new Date();

  const targets: Array<{ userId: string; localDate: string }> = [];

  if (parsed.data.userId) {
    let localDate = parsed.data.localDate;
    if (!localDate) {
      const { data: profile, error } = await client.from("profiles").select("timezone").eq("id", parsed.data.userId).single();
      if (error) return apiErr(`Unknown user: ${error.message}`, 404);
      localDate = addDays(localDateFromInstant(now(), profile.timezone), -1);
    }
    targets.push({ userId: parsed.data.userId, localDate });
  } else {
    const { data: profiles, error } = await client.from("profiles").select("id, timezone");
    if (error) return apiErr(`Failed to load profiles: ${error.message}`, 500);
    for (const profile of profiles ?? []) {
      targets.push({ userId: profile.id, localDate: addDays(localDateFromInstant(now(), profile.timezone), -1) });
    }
  }

  const outcomes: NightlyAnalysisOutcome[] = [];
  const failures: Array<{ userId: string; localDate: string; error: string }> = [];

  for (const target of targets) {
    try {
      const outcome = await runNightlyAnalysisForUser({ client, provider, model: MODEL, maxTokens: MAX_TOKENS, now }, target.userId, target.localDate);
      outcomes.push(outcome);
    } catch (err) {
      // A failure this deep (e.g. the user has no profile row at all) is a real defect
      // worth surfacing in the response -- one user's failure must not abort the whole
      // batch, since every other user's report is independent and still worth producing.
      failures.push({ userId: target.userId, localDate: target.localDate, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return apiOk({ processed: outcomes.length, outcomes, failures });
});
