// Full, portable data export for the caller's own account. JWT-verified; userId comes
// from getVerifiedCaller only, same identity discipline as account-delete. Read-only, so
// the stakes here are lower than deletion, but "export the wrong user's data" is still a
// real privacy bug -- avoided entirely by using the caller's own RLS-scoped client for
// every read rather than a service-role client with hand-written user_id filters.

import { createClient } from "npm:@supabase/supabase-js@2";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { exportAccount } from "../_shared/account/exportAccount.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  try {
    const result = await exportAccount(client, userId);
    return apiOk(result);
  } catch (err) {
    return apiErr(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
});
