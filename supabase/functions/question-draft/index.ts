// Drafts questions from pasted notes and RETURNS them -- nothing is stored. Every
// accepted card goes through createQuestion client-side, individually, after the user
// edits it (the Part X exception's condition). See _shared/questions/draft.ts.
//
// JWT verification: on (config.toml [functions.question-draft] verify_jwt = true).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { draftQuestions } from "../_shared/questions/draft.ts";

const RequestSchema = z.object({
  notesText: z.string().min(200, "Paste at least a few paragraphs -- drafting from a sentence produces trivia.").max(60_000),
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
  if (!parsed.success) {
    return apiErr(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { client, userId } = caller;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return apiErr("Question drafting is not configured on this server (no Anthropic API key).", 503);
  }

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

  const result = await draftQuestions(gatewayDeps, {
    userId,
    budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
    notesText: parsed.data.notesText,
  });

  switch (result.kind) {
    case "drafted":
      return apiOk(result);
    case "tooThin":
      return apiOk(result);
    case "budgetExceeded":
      return apiErr("Monthly LLM budget exceeded -- drafting paused until the 1st.", 429);
    case "draftFailed":
      return apiErr(result.reason, 502);
  }
});
