// Returns (generating at most once per local day) the morning brief for the caller.
// Deterministic-first per the nightly-analysis discipline; the cached row is the whole
// point -- a screen re-render must never mean another paid model call.
//
// JWT verification: on (config.toml [functions.morning-brief] verify_jwt = true).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { generateMorningBrief, loadBriefFacts, buildDeterministicBrief } from "../_shared/brief/morningBrief.ts";

const RequestSchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErr("Request body must be valid JSON.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr("Invalid request: localDate must be YYYY-MM-DD.", 400);

  const { client, userId } = caller;
  const localDate = parsed.data.localDate;

  // Cache hit: the day already has its brief.
  const { data: day, error: dayError } = await client
    .from("days")
    .select("id, morning_brief, morning_brief_source")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .maybeSingle();
  if (dayError) return apiErr(dayError.message, 500);
  if (day?.morning_brief != null) {
    return apiOk({ brief: day.morning_brief, source: day.morning_brief_source, cached: true });
  }

  const facts = await loadBriefFacts(client, userId, localDate);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  let brief: string;
  let source: "model" | "deterministic";
  if (!apiKey) {
    // No key is a normal state, not an error: the deterministic brief IS the brief.
    brief = buildDeterministicBrief(facts);
    source = "deterministic";
  } else {
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("llm_monthly_budget_usd")
      .eq("id", userId)
      .single();
    if (profileError) return apiErr(profileError.message, 500);

    const gatewayDeps: GatewayDeps = {
      provider: createAnthropicProvider(apiKey),
      getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
      logUsage: (entry) => logUsage(client, entry),
      now: () => new Date(),
    };
    const result = await generateMorningBrief(gatewayDeps, {
      userId,
      budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
      facts,
    });
    brief = result.brief;
    source = result.source;
  }

  // Upsert-then-fill, same shape as startDay: the days row may not exist yet (the brief
  // can be requested before Start Day), and a concurrent generation should not double-write
  // -- last write wins on the same content class, which is acceptable for a note.
  const { error: upsertError } = await client
    .from("days")
    .upsert({ user_id: userId, local_date: localDate }, { onConflict: "user_id,local_date", ignoreDuplicates: true });
  if (upsertError) return apiErr(upsertError.message, 500);
  const { error: updateError } = await client
    .from("days")
    .update({ morning_brief: brief, morning_brief_source: source, morning_brief_generated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("local_date", localDate);
  if (updateError) return apiErr(updateError.message, 500);

  return apiOk({ brief, source, cached: false });
});
