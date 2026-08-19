// Receives WHOOP's webhook notifications (e.g. "a new sleep/recovery/workout is ready").
// WHOOP calls this directly -- there is no Supabase session, so config.toml sets
// verify_jwt = false for this function and the signature check IS the authentication.
// Uses the service-role client (not getVerifiedCaller) because there is no caller JWT to
// verify against; every downstream query is scoped explicitly by the resolved user id
// rather than relying on RLS.
//
// Scope of this function tonight: verify the signature, resolve which of our users the
// notification is for (via oauth_connections.external_account_id, migration 0019), and
// acknowledge. It deliberately does NOT yet fetch the referenced resource from WHOOP's
// REST API and run it through ingestWhoopTelemetry -- WHOOP's webhook payload is a
// notification ("this resource changed"), not the resource itself, so completing the
// loop needs a second authenticated WHOOP API call using the stored (and possibly
// expired -> refreshed via isTokenExpiringSoon) access token. Flagged as the explicit
// next step in docs/FOLLOWUPS.md rather than half-built here.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, handleCorsPreflight } from "../_shared/http.ts";
import { verifyWhoopWebhookSignature } from "../_shared/whoop/webhookSignature.ts";

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

  const clientSecret = Deno.env.get("WHOOP_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!clientSecret || !supabaseUrl || !serviceRoleKey) {
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
  const { data: connection, error: lookupError } = await admin
    .from("oauth_connections")
    .select("user_id")
    .eq("provider", "whoop")
    .eq("external_account_id", String(envelope.data.user_id))
    .eq("status", "active")
    .maybeSingle();
  if (lookupError) return apiErr(`Failed to resolve WHOOP account: ${lookupError.message}`, 500);

  // WHOOP retries webhooks that don't return 2xx -- acknowledging an unresolvable account
  // (rather than 4xx-ing) avoids a permanent retry storm for a connection we've since
  // disconnected, while still not fabricating a successful ingest that never happened.
  if (!connection) return apiOk({ received: true, resolved: false });

  return apiOk({ received: true, resolved: true, userId: connection.user_id, eventType: envelope.data.type });
});
