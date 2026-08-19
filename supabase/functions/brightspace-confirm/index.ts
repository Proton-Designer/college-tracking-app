// The ONLY server-side path from a staged ics_event_extractions row to a real
// calendar_events write -- see _shared/brightspace/confirm.ts's own header comment for
// the security property this guarantees. Same "one path to done" architecture as
// syllabus-confirm, deployed as a server-side Edge Function for the same reason: RLS
// lets a user's own client write directly to calendar_events, so a client-side
// confirmation check is advisory only.
//
// JWT verification: config.toml's [functions.brightspace-confirm] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip (see _shared/http.ts).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { confirmIcsEvent } from "../_shared/brightspace/confirm.ts";

const RequestSchema = z.object({
  extractionId: z.number().int().positive(),
  decision: z.enum(["confirmed", "rejected"]),
  isClassMeeting: z.boolean().optional(),
  courseId: z.number().int().positive().optional(),
});

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return apiErr("Method not allowed.", 405);

  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiErr("Request body must be valid JSON.", 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiErr(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, 400);
  }

  const result = await confirmIcsEvent(client, {
    extractionId: parsed.data.extractionId,
    userId,
    decision: parsed.data.decision,
    ...(parsed.data.isClassMeeting != null ? { isClassMeeting: parsed.data.isClassMeeting } : {}),
    ...(parsed.data.courseId != null ? { courseId: parsed.data.courseId } : {}),
  });

  if (!result.ok) return apiErr(result.error, 409);
  return apiOk(result);
});
