// Creates and parses one announcement: raw pasted text in, a staged diff out
// (announcements.parsed_diff, status='parsed'). Never writes to deliverables -- that is
// announcement-confirm's job alone, the same one-path-to-done split syllabus-extract /
// syllabus-confirm established and brightspace repeated. Third instance of the pattern.
//
// JWT verification: on (config.toml [functions.parse-announcement] verify_jwt = true,
// plus the redundant getVerifiedCaller round-trip -- see _shared/http.ts).
//
// Accepts EITHER {courseId, rawText} (creates the announcement row, then parses it) or
// {announcementId} (re-parses an existing failed/pending row). One function rather than
// create+parse endpoints because the paste flow is one user gesture, and a row that
// exists but was never parsed is a state the UI would otherwise have to invent handling
// for.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { parseAnnouncement, type CourseItemContext } from "../_shared/announcements/parse.ts";

const RequestSchema = z.union([
  z.object({ courseId: z.number().int().positive(), rawText: z.string().min(1).max(20_000) }),
  z.object({ announcementId: z.number().int().positive() }),
]);

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

  const { client, userId } = caller;

  // Resolve (or create) the announcement row. RLS scopes every query to the caller.
  let announcementId: number;
  let courseId: number;
  let rawText: string;

  if ("announcementId" in parsed.data) {
    const { data: row, error } = await client
      .from("announcements")
      .select("id, course_id, raw_text, status")
      .eq("id", parsed.data.announcementId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return apiErr(error.message, 500);
    if (!row) return apiErr("That announcement could not be found.", 404);
    if (row.status === "applied") {
      // Re-parsing an applied announcement would stage a second diff for changes that
      // already landed -- refuse rather than double-apply, same reasoning as
      // syllabus-confirm's idempotent double-confirm refusal.
      return apiErr("This announcement was already applied.", 409);
    }
    announcementId = row.id;
    courseId = row.course_id;
    rawText = row.raw_text;
  } else {
    const { data: course, error: courseError } = await client
      .from("courses")
      .select("id")
      .eq("id", parsed.data.courseId)
      .eq("user_id", userId)
      .maybeSingle();
    if (courseError) return apiErr(courseError.message, 500);
    if (!course) return apiErr("That course could not be found.", 404);

    const { data: created, error: insertError } = await client
      .from("announcements")
      .insert({ user_id: userId, course_id: parsed.data.courseId, raw_text: parsed.data.rawText })
      .select("id")
      .single();
    if (insertError) return apiErr(insertError.message, 500);
    announcementId = created.id;
    courseId = parsed.data.courseId;
    rawText = parsed.data.rawText;
  }

  // The course's current items, as matching context for date_change proposals.
  const { data: deliverables, error: delivError } = await client
    .from("deliverables")
    .select("title, local_due_date, type")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .neq("status", "completed")
    .order("local_due_date", { ascending: true })
    .limit(50);
  if (delivError) return apiErr(delivError.message, 500);
  const courseItems: CourseItemContext[] = (deliverables ?? []).map((d) => ({
    title: d.title,
    dueDate: d.local_due_date,
    type: d.type,
  }));

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("llm_monthly_budget_usd")
    .eq("id", userId)
    .single();
  if (profileError) return apiErr(profileError.message, 500);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.log(`[parse-announcement] no ANTHROPIC_API_KEY configured; refusing announcement ${announcementId}`);
    return apiErr("Announcement parsing is not yet configured on this server (no Anthropic API key).", 503);
  }

  const gatewayDeps: GatewayDeps = {
    provider: createAnthropicProvider(apiKey),
    getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
    logUsage: (entry) => logUsage(client, entry),
    now: () => new Date(),
  };

  const result = await parseAnnouncement(client, gatewayDeps, {
    announcementId,
    userId,
    budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
    rawText,
    courseItems,
  });

  switch (result.kind) {
    case "parsed":
      return apiOk(result);
    case "noSchedulableContent":
      // Filed to the course, not an error -- 5.2's own words. 200, distinct kind.
      return apiOk(result);
    case "budgetExceeded":
      return apiErr("Monthly LLM budget exceeded -- parsing paused until the 1st.", 429);
    case "parseFailed":
      return apiErr(result.reason, 502);
  }
});
