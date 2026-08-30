// Drives the `ingest_jobs` state machine (migration 54, section 5) — ONE step per
// invocation, then returns.
//
// Four gestures, canvas-sync's shape:
//
//   {sourceId}          enqueue if needed, then advance one step. The user's own
//                       "ingest this book" / "keep going" call.
//   {jobId}             advance one step of an existing job. What the self-continuation
//                       below calls, and what a manual retry uses.
//   {driveAll: true}    cron mode, gated on x-cron-secret: advance every job whose
//                       heartbeat has gone stale.
//   {}                  advance every one of the caller's own non-terminal jobs by one
//                       step. The app's "resume anything stuck" gesture.
//
// JWT verification: OFF in config.toml (the cron path has no user JWT). User calls are
// verified by getVerifiedCaller exactly as everywhere else, and the cron path requires
// the shared secret BEFORE any service-role client exists — nightly-analysis's shape.
//
// KEYS. Neither ANTHROPIC_API_KEY nor VOYAGE_API_KEY exists in this environment, and the
// two absences are deliberately NOT symmetric:
//   * No VOYAGE_API_KEY is D41: ingestion completes, embeddings stay null, the merge pass
//     clusters lexically, and the job records why. Nothing fails.
//   * No ANTHROPIC_API_KEY BLOCKS at `extracting_lessons`, and again at `generating_cards`
//     if a key is removed after extraction finished: the pipeline runs everything up to
//     each of them for real (download, page-range extraction, structure, chunking,
//     embedding), records an honest reason on the job, and resumes from the same cursor the
//     moment a key is supplied. It is not marked failed, because nothing about the job is
//     wrong. The second block is D45's card half refusing rather than shipping a deck of
//     nothing but deterministic fill-in-the-blank cards, which is recognition practice
//     indistinguishable from the real thing until months of it have taught nobody anything.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { resolveEmbeddingsProvider } from "../_shared/embeddings/embed.ts";
import { advanceIngestJob, redriveStalledJobs, type AdvanceOutcome, type IngestDeps } from "../_shared/learn/ingest.ts";
import { extractPdfPageRange } from "../_shared/learn/pdfPages.ts";
import { createSupabaseIngestRepo } from "../_shared/learn/supabaseRepo.ts";
import { STALL_MINUTES } from "../_shared/learn/types.ts";

const RequestSchema = z.union([
  z.object({ sourceId: z.number().int().positive() }).strict(),
  z.object({ jobId: z.number().int().positive() }).strict(),
  z.object({ driveAll: z.literal(true) }).strict(),
  z.object({}).strict(),
]);

/** Jobs one cron tick will touch. Bounded so a backlog cannot make a single invocation
 *  long — the same rule the state machine follows, applied to the driver. */
const REDRIVE_LIMIT = 20;

/** Guards the self-continuation below against a runaway chain. A 300-page book needs
 *  roughly 50 invocations (see _shared/learn/costEstimate.ts); 200 is generous headroom
 *  and still a hard stop, after which the stall cron takes over at its own pace. */
const MAX_CHAIN_DEPTH = 200;
const CHAIN_HEADER = "x-ingest-chain";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

function buildDeps(client: AnyClient): IngestDeps {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const gateway: GatewayDeps | null = anthropicKey
    ? {
      provider: createAnthropicProvider(anthropicKey),
      getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
      logUsage: (entry) => logUsage(client, entry),
      now: () => new Date(),
    }
    : null;

  return {
    repo: createSupabaseIngestRepo(client),
    gateway,
    // Null when VOYAGE_API_KEY is absent — an ordinary value, and today's expected one.
    embeddings: resolveEmbeddingsProvider(),
    extractPages: extractPdfPageRange,
    logUsage: (entry) => logUsage(client, entry),
    now: () => new Date(),
  };
}

/**
 * Fire-and-forget self-invocation so a book does not advance one step per cron tick.
 *
 * This does NOT weaken the one-step-per-invocation rule: each invocation still advances
 * exactly one step and returns immediately: it simply asks for the next one rather than
 * waiting until the stall cron notices. The chain stops on anything that is not a plain
 * advance (terminal, blocked, retry), at MAX_CHAIN_DEPTH, and — as the real backstop —
 * the stall cron re-drives whatever the chain dropped, so a lost continuation costs
 * latency and never correctness.
 */
function scheduleContinuation(jobId: number, depth: number): void {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!baseUrl || !cronSecret || !anonKey || depth >= MAX_CHAIN_DEPTH) return;

  const next = fetch(`${baseUrl}/functions/v1/learn-ingest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      "x-cron-secret": cronSecret,
      [CHAIN_HEADER]: String(depth + 1),
    },
    body: JSON.stringify({ jobId }),
  }).catch((err) => {
    console.log(`[learn-ingest] continuation for job ${jobId} failed: ${err instanceof Error ? err.message : String(err)}`);
  });

  // Without waitUntil the runtime cancels the pending request the moment we respond.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") runtime.waitUntil(next);
}

function shouldContinue(outcome: AdvanceOutcome): boolean {
  return outcome.kind === "advanced" && outcome.moreWork;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  let body: unknown = {};
  const rawBody = await req.text();
  if (rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return apiErr("Request body must be valid JSON.", 400);
    }
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request: ${parsed.error.message}`, 400);

  const chainDepth = Number(req.headers.get(CHAIN_HEADER) ?? "0") || 0;
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
  const presentedSecret = req.headers.get("x-cron-secret");
  const isCronCall = cronSecret != null && presentedSecret === cronSecret;

  // ---- cron: re-drive everything stalled -------------------------------------------
  if ("driveAll" in parsed.data) {
    if (!isCronCall) return apiErr("Invalid or missing cron secret.", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return apiErr("Server misconfigured: missing Supabase service-role environment.", 500);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);

    const staleBefore = new Date(Date.now() - STALL_MINUTES * 60_000);
    // The re-driver runs as service_role across every user's jobs and has NO single
    // caller identity. That is why the repo takes the owning user id per write rather
    // than capturing one (see repo.ts): the driver passes `job.userId` on every insert,
    // so a cron-driven row is owned by the job's real user, not by whoever triggered the
    // tick.
    const deps = buildDeps(client);
    const results = await redriveStalledJobs(deps, staleBefore, REDRIVE_LIMIT);

    for (const result of results) {
      if (shouldContinue(result.outcome)) scheduleContinuation(result.jobId, chainDepth);
    }
    return apiOk({ redriven: results.length, results });
  }

  // ---- the self-continuation, authenticated by the cron secret ----------------------
  if (isCronCall && "jobId" in parsed.data) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return apiErr("Server misconfigured: missing Supabase service-role environment.", 500);
    }
    const client = createClient(supabaseUrl, serviceRoleKey);
    const deps = buildDeps(client);
    const outcome = await advanceIngestJob(deps, parsed.data.jobId);
    if (shouldContinue(outcome)) scheduleContinuation(parsed.data.jobId, chainDepth);
    return apiOk({ jobId: parsed.data.jobId, outcome });
  }

  // ---- user-triggered ---------------------------------------------------------------
  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;
  const deps = buildDeps(client);

  if ("sourceId" in parsed.data) {
    const { data: source, error: sourceError } = await client
      .from("sources")
      .select("id, status")
      .eq("id", parsed.data.sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sourceError) return apiErr(sourceError.message, 500);
    if (!source) return apiErr("That source could not be found.", 404);

    const { data: existing, error: jobError } = await client
      .from("ingest_jobs")
      .select("id")
      .eq("source_id", parsed.data.sourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (jobError) return apiErr(jobError.message, 500);

    let jobId = existing?.id as number | undefined;
    if (jobId == null) {
      // `ingest_jobs_one_live_per_source` (unique on source_id) makes this idempotent
      // under a double-tap: the second insert loses and we read the winner back.
      const { data: created, error: createError } = await client
        .from("ingest_jobs")
        .insert({ user_id: userId, source_id: parsed.data.sourceId })
        .select("id")
        .single();
      if (createError) {
        const { data: raced } = await client
          .from("ingest_jobs")
          .select("id")
          .eq("source_id", parsed.data.sourceId)
          .eq("user_id", userId)
          .maybeSingle();
        if (!raced) return apiErr(createError.message, 500);
        jobId = raced.id;
      } else {
        jobId = created.id;
      }
    }

    const outcome = await advanceIngestJob(deps, jobId!);
    if (shouldContinue(outcome)) scheduleContinuation(jobId!, chainDepth);
    return apiOk({ jobId, outcome });
  }

  if ("jobId" in parsed.data) {
    const { data: job, error } = await client
      .from("ingest_jobs")
      .select("id")
      .eq("id", parsed.data.jobId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return apiErr(error.message, 500);
    if (!job) return apiErr("That ingestion job could not be found.", 404);

    const outcome = await advanceIngestJob(deps, parsed.data.jobId);
    if (shouldContinue(outcome)) scheduleContinuation(parsed.data.jobId, chainDepth);
    return apiOk({ jobId: parsed.data.jobId, outcome });
  }

  // {} — advance each of the caller's own non-terminal jobs by one step.
  const { data: jobs, error: listError } = await client
    .from("ingest_jobs")
    .select("id")
    .eq("user_id", userId)
    .not("step", "in", "(done,failed)")
    .order("heartbeat_at", { ascending: true })
    .limit(REDRIVE_LIMIT);
  if (listError) return apiErr(listError.message, 500);

  const results: Array<{ jobId: number; outcome: AdvanceOutcome }> = [];
  for (const job of jobs ?? []) {
    const outcome = await advanceIngestJob(deps, job.id);
    results.push({ jobId: job.id, outcome });
    if (shouldContinue(outcome)) scheduleContinuation(job.id, chainDepth);
  }
  return apiOk({ advanced: results.length, results });
});
