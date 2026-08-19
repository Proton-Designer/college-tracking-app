// Completes the WHOOP OAuth2 authorization_code flow. Called by our own frontend right
// after WHOOP redirects the user back with a `code` -- not by WHOOP directly (that's
// whoop-webhook's job). JWT-verified: this is one of our authenticated users connecting
// their own account, same trust model as brightspace-sync's connect step.
//
// Real network call to WHOOP's token + profile endpoints happens only via
// createWhoopOAuthProvider, which is untestable live in this environment (no WHOOP
// developer credentials exist tonight) -- see realProvider.ts's header comment and
// docs/SUPABASE_SETUP.md's WHOOP section for the live-verification checklist.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createWhoopOAuthProvider } from "../_shared/whoop/realProvider.ts";
import { storeWhoopToken } from "../_shared/whoop/tokenStore.ts";

const RequestSchema = z.object({ code: z.string().min(1), redirectUri: z.string().url() });

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  const clientId = Deno.env.get("WHOOP_CLIENT_ID");
  const clientSecret = Deno.env.get("WHOOP_CLIENT_SECRET");
  if (!clientId || !clientSecret) return apiErr("Server misconfigured: WHOOP OAuth credentials are not set.", 500);

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return apiErr("Malformed JSON body.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request body: ${parsed.error.message}`, 400);

  const provider = createWhoopOAuthProvider(clientId, clientSecret);

  try {
    const token = await provider.exchangeAuthorizationCode(parsed.data.code, parsed.data.redirectUri);
    const externalAccountId = await provider.getAuthenticatedUserId(token.accessToken);
    await storeWhoopToken(client, userId, token, externalAccountId);
    return apiOk({ connected: true });
  } catch (err) {
    return apiErr(`WHOOP connection failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
});
