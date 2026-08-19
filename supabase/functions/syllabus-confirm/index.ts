// The ONLY HTTP path from a staged syllabus extraction to real academic data
// (courses/deliverables/grade_categories/...) -- see _shared/syllabus/confirm.ts's own
// header comment for the security property this guarantees. Deploying this as a server-
// side Edge Function, rather than calling promoteExtraction from the client, is the
// Lead's explicit ruling: RLS lets a user's own client write directly to those tables,
// so a client-side confirmation check is advisory only -- a bug or a future refactor
// could bypass the weight-sum check, the edited-payload re-validation, and the
// unresolved-date rejection entirely. This is the one place that can't be walked around.
//
// JWT verification: on (config.toml's [functions.syllabus-confirm] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip below -- see _shared/http.ts).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { promoteExtraction, type ConfirmExtractionResult } from "../_shared/syllabus/confirm.ts";

const RequestSchema = z.object({
  extractionId: z.number().int().positive(),
  courseId: z.number().int().positive().optional(),
  decision: z.enum(["confirmed", "edited", "rejected"]),
  editedPayload: z.record(z.string(), z.unknown()).optional(),
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
    return apiErr(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`, 400);
  }

  // userId comes from the verified session (caller.userId), never from the request body
  // -- see getVerifiedCaller's own comment for why that matters.
  const result: ConfirmExtractionResult = await promoteExtraction(caller.client, {
    extractionId: parsed.data.extractionId,
    userId: caller.userId,
    ...(parsed.data.courseId != null ? { courseId: parsed.data.courseId } : {}),
    decision: parsed.data.decision,
    ...(parsed.data.editedPayload != null ? { editedPayload: parsed.data.editedPayload } : {}),
  });

  if (!result.ok) {
    // Not found / already-processed / validation failure are all caller mistakes, not
    // server failures -- 409 (conflict with current state) covers "already processed"
    // and validation errors alike; 404 specifically for "no such extraction".
    const status = result.error.includes("not found") ? 404 : 409;
    return apiErr(result.error, status);
  }

  return apiOk(result);
});
