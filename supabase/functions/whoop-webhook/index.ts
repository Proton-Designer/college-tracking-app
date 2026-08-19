// Receives WHOOP's webhook notifications (e.g. "a new sleep/recovery/workout is ready").
// WHOOP calls this directly -- there is no Supabase session, so config.toml sets
// verify_jwt = false for this function and the signature check IS the authentication.
// Uses the service-role client (not getVerifiedCaller) because there is no caller JWT to
// verify against; every downstream query is scoped explicitly by the resolved user id
// rather than relying on RLS.
//
// Verifies the signature, then hands off to handleWhoopWebhook (_shared/whoop -- the
// testable orchestrator that resolves the account, refreshes the token if needed, fetches
// the referenced resource, normalizes it, and ingests it through the same
// ingestWhoopTelemetry path proven in ingest.itest.ts). Fetches synchronously rather than
// acking first and processing in the background (e.g. EdgeRuntime.waitUntil) -- there is
// no existing precedent for a background-execution pattern anywhere else in this
// codebase's Edge Functions, and idempotency (migration 0021's dedup index, enforced
// inside ingestWhoopTelemetry) already makes a WHOOP retry safe regardless of how long
// this handler takes, which is the property that actually matters.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, handleCorsPreflight } from "../_shared/http.ts";
import { verifyWhoopWebhookSignature } from "../_shared/whoop/webhookSignature.ts";
import { handleWhoopWebhook } from "../_shared/whoop/webhookHandler.ts";
import { createWhoopOAuthProvider } from "../_shared/whoop/realProvider.ts";
import { createWhoopResourceFetcher } from "../_shared/whoop/realResourceFetcher.ts";

const WebhookEnvelopeSchema = z.object({
  user_id: z.number(),
  id: z.string(),
  type: z.string(),
  trace_id: z.string().optional(),
});

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const clientId = Deno.env.get("WHOOP_CLIENT_ID");
  const clientSecret = Deno.env.get("WHOOP_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientId || !clientSecret || !supabaseUrl || !serviceRoleKey) {
    return apiErr("Server misconfigured: WHOOP webhook environment is incomplete.", 500);
  }

  const rawBody = await req.text();

  const verification = await verifyWhoopWebhookSignature({
    rawBody,
    timestampHeader: req.headers.get("X-WHOOP-Signature-Timestamp"),
    signatureHeader: req.headers.get("X-WHOOP-Signature"),
    clientSecret,
  });
  if (!verification.ok) return apiErr(`Webhook signature verification failed: ${verification.reason}`, 401);

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return apiErr("Malformed JSON body.", 400);
  }
  const envelope = WebhookEnvelopeSchema.safeParse(parsedBody);
  if (!envelope.success) return apiErr(`Invalid webhook envelope: ${envelope.error.message}`, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const provider = createWhoopOAuthProvider(clientId, clientSecret);
  const resourceFetcher = createWhoopResourceFetcher();

  try {
    const result = await handleWhoopWebhook(
      admin,
      provider,
      resourceFetcher,
      { externalUserId: String(envelope.data.user_id), resourceId: envelope.data.id, eventType: envelope.data.type },
      new Date().toISOString(),
    );
    // WHOOP retries webhooks that don't return 2xx -- every outcome here (including an
    // unresolvable account or an untracked event type) acks with 200 rather than 4xx/5xx,
    // so a connection we've since disconnected or an event type we don't ingest doesn't
    // trigger a permanent retry storm. Only a genuine processing failure (caught below)
    // returns non-2xx, since that's the one case a retry might actually help with.
    return apiOk(result);
  } catch (err) {
    return apiErr(`Webhook processing failed: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});
