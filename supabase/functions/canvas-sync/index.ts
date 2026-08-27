// Canvas connect + announcements poll (docs/CANVAS_AUDIT.md §4). One endpoint, four
// gestures -- mirroring brightspace-sync's "connect is just sync with storage first":
//
//   {baseUrl, token}   connect: SSRF-check the host, verify the token against
//                      /users/self, store the token in Vault (F3), upsert the
//                      connection, and return the active Canvas courses so the app can
//                      offer the mapping picker.
//   {links: [...]}     replace the user's course mapping (human-confirmed, never fuzzy).
//   {}                 poll now, as the caller. New announcements are staged and -- when
//                      the key is present -- parsed; nothing applies without the user
//                      confirming the diff (announcement-confirm remains the only write
//                      path to deliverables).
//   {pollAll: true}    cron mode, gated on x-cron-secret: poll every connected user.
//
// JWT verification: OFF in config.toml (the cron path has no user JWT); user calls are
// verified by getVerifiedCaller exactly as everywhere else, and the cron path requires
// the shared secret BEFORE any service-role client exists (nightly-analysis's shape).

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "zod";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "../_shared/http.ts";
import { assertSafeFeedUrl } from "../_shared/brightspace/urlSafety.ts";
import { CanvasApiError, listActiveCourses, verifyCanvasToken } from "../_shared/canvas/api.ts";
import { storeCanvasToken } from "../_shared/canvas/keyStore.ts";
import { pollAnnouncementsForUser, type PollResult } from "../_shared/canvas/sync.ts";
import { decideGradeExtraction, pollGradesForUser } from "../_shared/canvas/grades.ts";
import { createAnthropicProvider } from "../_shared/llm/anthropicProvider.ts";
import { getMonthlySpendUsd, logUsage } from "../_shared/llm/budget.ts";
import type { GatewayDeps } from "../_shared/llm/gateway.ts";
import { parseAnnouncement, type CourseItemContext } from "../_shared/announcements/parse.ts";

const RequestSchema = z.union([
  z.object({
    baseUrl: z.string().url().startsWith("https://"),
    token: z.string().min(20).max(500),
  }),
  z.object({
    links: z
      .array(
        z.object({
          courseId: z.number().int().positive(),
          canvasCourseId: z.number().int().positive(),
          canvasCourseName: z.string().min(1).max(500),
        }),
      )
      .max(50),
  }),
  z.object({ pollAll: z.literal(true) }),
  z.object({
    gradeDecision: z.object({
      extractionId: z.number().int().positive(),
      decision: z.enum(["applied", "rejected"]),
      gradeItemId: z.number().int().positive().optional(),
    }),
  }),
  z.object({}).strict(),
]);

// deno-lint-ignore no-explicit-any
type AnyClient = any;

/** Stage → parse for every announcement the poll inserted. Parse failures per row are
 *  recorded on the row by parseAnnouncement itself (status='failed'); a missing key
 *  leaves rows 'pending', which the review surface shows honestly rather than hiding. */
async function parseInserted(client: AnyClient, userId: string, poll: PollResult): Promise<{ parsed: number; unparsed: number }> {
  if (poll.kind !== "polled" || poll.inserted.length === 0) return { parsed: 0, unparsed: 0 };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { parsed: 0, unparsed: poll.inserted.length };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("llm_monthly_budget_usd")
    .eq("id", userId)
    .single();
  if (profileError) throw new Error(`Failed to read profile for parsing: ${profileError.message}`);

  const gatewayDeps: GatewayDeps = {
    provider: createAnthropicProvider(apiKey),
    getMonthlySpendUsd: (uid: string) => getMonthlySpendUsd(client, uid, new Date()),
    logUsage: (entry) => logUsage(client, entry),
    now: () => new Date(),
  };

  let parsed = 0;
  let unparsed = 0;
  for (const item of poll.inserted) {
    const { data: deliverables, error: delivError } = await client
      .from("deliverables")
      .select("title, local_due_date, type")
      .eq("user_id", userId)
      .eq("course_id", item.courseId)
      .neq("status", "completed")
      .order("local_due_date", { ascending: true })
      .limit(50);
    if (delivError) throw new Error(`Failed to read deliverables for parsing: ${delivError.message}`);
    const courseItems: CourseItemContext[] = (deliverables ?? []).map((d: { title: string; local_due_date: string | null; type: string }) => ({
      title: d.title,
      dueDate: d.local_due_date,
      type: d.type,
    }));

    const result = await parseAnnouncement(client, gatewayDeps, {
      announcementId: item.announcementId,
      userId,
      budgetCeilingUsd: Number(profile.llm_monthly_budget_usd),
      rawText: item.rawText,
      courseItems,
    });
    if (result.kind === "parsed" || result.kind === "noSchedulableContent") parsed++;
    else unparsed++;
    if (result.kind === "budgetExceeded") break; // every further parse would also fail
  }
  return { parsed, unparsed };
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
      return apiErr("Malformed JSON body.", 400);
    }
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return apiErr(`Invalid request body: ${parsed.error.message}`, 400);

  // ---- Cron mode: shared secret, service role, every connected user. ----
  if ("pollAll" in parsed.data) {
    const cronSecret = Deno.env.get("CRON_SHARED_SECRET");
    if (!cronSecret) return apiErr("Server misconfigured: CRON_SHARED_SECRET not set.", 500);
    if (req.headers.get("x-cron-secret") !== cronSecret) {
      return apiErr("Invalid or missing cron secret.", 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return apiErr("Server misconfigured: missing Supabase service-role environment.", 500);
    }
    const service = createClient(supabaseUrl, serviceRoleKey);

    const { data: connections, error } = await service.from("canvas_connections").select("user_id");
    if (error) return apiErr(`Failed to list connections: ${error.message}`, 500);

    const perUser: Array<{ userId: string; result: string }> = [];
    for (const row of connections ?? []) {
      try {
        // Base-URL safety is re-checked inside the fetch path via connect-time
        // validation; a hostile DNS flip between polls is bounded by the https +
        // public-IP checks at connect. Poll errors are per-user: one revoked token
        // must not stop every other user's poll.
        const poll = await pollAnnouncementsForUser(service, row.user_id, () => new Date());
        if (poll.kind === "polled") {
          const parseOutcome = await parseInserted(service, row.user_id, poll);
          const grades = await pollGradesForUser(service, row.user_id);
          const gradesNote = grades.kind === "polled" ? `, grades staged ${grades.staged}` : "";
          const truncatedNote = poll.truncated > 0 ? `, truncated ${poll.truncated}` : "";
          perUser.push({ userId: row.user_id, result: `staged ${poll.inserted.length}, parsed ${parseOutcome.parsed}${truncatedNote}${gradesNote}` });
        } else {
          perUser.push({ userId: row.user_id, result: poll.kind });
        }
      } catch (err) {
        perUser.push({ userId: row.user_id, result: `error: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    return apiOk({ polled: perUser.length, perUser });
  }

  // ---- User modes. ----
  const caller = await getVerifiedCaller(req, createClient);
  if (!caller.ok) return caller.response;
  const { client, userId } = caller;

  if ("baseUrl" in parsed.data) {
    const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
    const safety = await assertSafeFeedUrl(baseUrl);
    if (!safety.ok) return apiErr(`Refusing to connect this Canvas host: ${safety.reason}`, 400);

    const verified = await verifyCanvasToken(baseUrl, parsed.data.token);
    if (!verified.ok) return apiErr(verified.reason, 400);

    await storeCanvasToken(client, userId, parsed.data.token);
    const { error: upsertError } = await client
      .from("canvas_connections")
      .upsert({ user_id: userId, base_url: baseUrl }, { onConflict: "user_id" })
      .select("id")
      .single();
    if (upsertError) return apiErr(`Failed to save the connection: ${upsertError.message}`, 500);

    let courses;
    try {
      courses = await listActiveCourses(baseUrl, parsed.data.token);
    } catch (err) {
      const status = err instanceof CanvasApiError ? 502 : 500;
      return apiErr(`Connected, but listing courses failed: ${err instanceof Error ? err.message : String(err)}`, status);
    }
    return apiOk({ connected: true, canvasUser: verified.userName, courses });
  }

  if ("links" in parsed.data) {
    // Replace-wholesale: the mapping is small, and "the links are what the picker
    // showed when you pressed save" is the only state a user can reason about.
    const { error: deleteError } = await client.from("canvas_course_links").delete().eq("user_id", userId);
    if (deleteError) return apiErr(`Failed to clear existing links: ${deleteError.message}`, 500);
    if (parsed.data.links.length > 0) {
      const { error: insertError } = await client.from("canvas_course_links").insert(
        parsed.data.links.map((l) => ({
          user_id: userId,
          course_id: l.courseId,
          canvas_course_id: l.canvasCourseId,
          canvas_course_name: l.canvasCourseName,
        })),
      );
      if (insertError) return apiErr(`Failed to save links: ${insertError.message}`, 500);
    }
    return apiOk({ saved: parsed.data.links.length });
  }

  if ("gradeDecision" in parsed.data) {
    try {
      const result = await decideGradeExtraction(client, {
        userId,
        extractionId: parsed.data.gradeDecision.extractionId,
        decision: parsed.data.gradeDecision.decision,
        ...(parsed.data.gradeDecision.gradeItemId != null ? { gradeItemId: parsed.data.gradeDecision.gradeItemId } : {}),
      });
      // Refusals are precise and re-editable -- a 422 whose body names what to fix,
      // the same grammar (and the same invokeEdgeFunction recovery path) as
      // announcement-confirm's.
      if (result.kind === "refused") return apiErr(result.reason, 422);
      return apiOk(result);
    } catch (err) {
      return apiErr(`Grade decision failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
  }

  // {} -- poll now, as the caller.
  try {
    const poll = await pollAnnouncementsForUser(client, userId, () => new Date());
    if (poll.kind !== "polled") return apiOk({ kind: poll.kind });
    const parseOutcome = await parseInserted(client, userId, poll);
    const grades = await pollGradesForUser(client, userId);
    return apiOk({
      kind: "polled",
      fetched: poll.fetched,
      staged: poll.inserted.length,
      skippedExisting: poll.skippedExisting,
      skippedUnmapped: poll.skippedUnmapped,
      truncated: poll.truncated,
      parsed: parseOutcome.parsed,
      unparsed: parseOutcome.unparsed,
      gradesStaged: grades.kind === "polled" ? grades.staged : 0,
      gradesUpdated: grades.kind === "polled" ? grades.updated : 0,
    });
  } catch (err) {
    if (err instanceof CanvasApiError && err.status === 401) {
      return apiErr("Canvas rejected the stored token — reconnect with a fresh one.", 401);
    }
    return apiErr(`Poll failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
});
