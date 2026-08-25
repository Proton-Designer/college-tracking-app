// The ONLY HTTP path from a staged announcement diff to a real deliverables write --
// see _shared/announcements/confirm.ts's header for the security property. Deployed
// server-side rather than applying client-side for the same reason syllabus-confirm is:
// RLS permits the user's own client to write deliverables, so a client-side check is
// advisory only; the unresolved-date rejection and all-or-nothing apply live here where
// they cannot be walked around.
//
// JWT verification: on (config.toml [functions.announcement-confirm] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { applyAnnouncement, type ConfirmAnnouncementResult } from "../_shared/announcements/confirm.ts";

// The same confirmation grammar as syllabus-confirm, by ruling: one vocabulary
// everywhere. The single deviation is payload shape (editedDiff, a whole small diff,
// where syllabus takes editedPayload per item) -- announcements are single-gesture diffs,
// not whole-semester extractions.
const RequestSchema = z.object({
  announcementId: z.number().int().positive(),
  decision: z.enum(["confirmed", "edited", "rejected"]),
  editedDiff: z.record(z.string(), z.unknown()).optional(),
});

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return apiErr("Method not allowed.", 405);
  }

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
    return apiErr(
      `Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
      400,
    );
  }

  if (parsed.data.decision === "edited" && parsed.data.editedDiff == null) {
    return apiErr("decision 'edited' requires editedDiff.", 400);
  }

  // userId from the verified session, never the body -- getVerifiedCaller's rule.
  const result: ConfirmAnnouncementResult = await applyAnnouncement(caller.client, {
    announcementId: parsed.data.announcementId,
    userId: caller.userId,
    decision: parsed.data.decision,
    ...(parsed.data.editedDiff != null ? { editedDiff: parsed.data.editedDiff } : {}),
  });

  if (!result.ok) {
    // 409 for state conflicts (already applied/rejected), 422 for a diff that cannot be
    // applied as-is (unresolved date, unmatched title) -- the caller can fix a 422 by
    // editing; a 409 means stop retrying.
    const conflict = result.error.includes("is") && result.error.includes("not parsed");
    return apiErr(result.error, conflict ? 409 : 422);
  }
  return apiOk(result);
});
