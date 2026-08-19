// Irreversibly deletes the caller's own account and everything in it. JWT-verified;
// userId comes ONLY from getVerifiedCaller's auth.getUser() round trip -- never a request
// body param. There is no admin/other-user path on this function at all; a
// service-role-triggered deletion (if ever needed) would be a separately named function,
// never a nullable parameter bolted onto this one.
//
// Body: {confirmEmail}. Must exactly match the caller's own session email (case-
// insensitive) or the request is refused before anything is touched -- see
// deleteAccount.ts's header comment for why this exists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { deleteAccount } from "../_shared/account/deleteAccount.ts";

const RequestSchema = z.object({ confirmEmail: z.string().min(1) });

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId, email } = caller;

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return apiErr("Malformed JSON body.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request body: ${parsed.error.message}`, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return apiErr("Server misconfigured: missing Supabase environment.", 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const result = await deleteAccount(client, admin, userId, email, parsed.data.confirmEmail);
  if (!result.ok) {
    const status = result.reason === "email_mismatch" ? 400 : 500;
    return apiErr(result.message, status);
  }
  return apiOk(result.report);
});
