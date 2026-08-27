// Canvas REST plumbing -- the personal-access-token door (BLUEPRINT Part XI), never
// institutional OAuth. Pure request/normalize logic with fetch injected via
// globalThis, so every shape here is provable offline against documented Canvas
// response fixtures (docs/CANVAS_AUDIT.md §4.2).

import { fetchWithTimeout } from "./timeoutFetch.ts";

export interface CanvasCourse {
  id: number;
  name: string;
  courseCode: string;
}

export interface CanvasAnnouncement {
  /** Canvas discussion-topic id -- the dedupe key (announcements.external_id). */
  id: number;
  title: string;
  /** Plain text, already stripped from Canvas's HTML message. */
  message: string;
  postedAt: string | null;
  /** e.g. "course_12345" -- maps through canvas_course_links. */
  contextCode: string;
}

/** Normalizes "https://school.instructure.com/" + "/api/v1/x" into one URL. */
export function canvasApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Canvas messages are HTML. The parse pipeline wants prose, and a professor's <p>/<br>
 * structure is real line-break information -- preserved as newlines, everything else
 * stripped. Regex-based on purpose: the edge runtime has no DOM, and announcement HTML
 * is display markup, not a document we need to understand.
 */
export function stripCanvasHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface CanvasSubmission {
  assignmentId: number;
  assignmentName: string;
  /** The graded score, present by construction (ungraded submissions are filtered out). */
  score: number;
  pointsPossible: number | null;
  gradedAt: string | null;
}

/** Bounds a poll: 10 pages × 50 per_page = 500 items, far beyond any real window. */
const MAX_PAGES = 10;

export class CanvasApiError extends Error {
  constructor(message: string, public readonly status: number | null) {
    super(message);
    this.name = "CanvasApiError";
  }
}

/**
 * GETs a Canvas collection endpoint, following RFC 5988 Link rel="next" pagination.
 * Throws CanvasApiError on a non-2xx (401 = revoked/wrong token -- the caller turns
 * that into a "reconnect" message, never a silent empty result).
 */
export async function canvasGetAll(baseUrl: string, token: string, pathWithQuery: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let url: string | null = canvasApiUrl(baseUrl, pathWithQuery);

  for (let page = 0; page < MAX_PAGES && url != null; page++) {
    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new CanvasApiError(`Canvas returned ${response.status} for ${new URL(url).pathname}.`, response.status);
    }
    const body = (await response.json()) as unknown;
    if (Array.isArray(body)) results.push(...body);
    else results.push(body);
    url = nextLink(response.headers.get("link"));
  }

  return results;
}

/** Extracts the rel="next" URL from a Canvas Link header, or null on the last page. */
export function nextLink(linkHeader: string | null): string | null {
  if (linkHeader == null) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/** GET /api/v1/users/self -- the cheapest "is this token real" probe. */
export async function verifyCanvasToken(
  baseUrl: string,
  token: string,
): Promise<{ ok: true; userName: string } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetchWithTimeout(canvasApiUrl(baseUrl, "/api/v1/users/self"), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch (err) {
    return { ok: false, reason: `Could not reach Canvas: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (response.status === 401) return { ok: false, reason: "Canvas rejected the token (401). Generate a fresh one under Account → Settings." };
  if (!response.ok) return { ok: false, reason: `Canvas returned ${response.status} verifying the token.` };
  const body = (await response.json()) as { name?: string };
  return { ok: true, userName: body.name ?? "(unnamed)" };
}

const CourseShape = (value: unknown): CanvasCourse | null => {
  if (typeof value !== "object" || value == null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "number" || typeof v.name !== "string") return null;
  return { id: v.id, name: v.name, courseCode: typeof v.course_code === "string" ? v.course_code : v.name };
};

/** Active enrollments only -- the mapping picker's candidates. */
export async function listActiveCourses(baseUrl: string, token: string): Promise<CanvasCourse[]> {
  const raw = await canvasGetAll(baseUrl, token, "/api/v1/courses?enrollment_state=active&per_page=50");
  return raw.map(CourseShape).filter((c): c is CanvasCourse => c != null);
}

/**
 * Announcements for the given context codes since startDate (ISO instant).
 * Canvas's announcements endpoint is GET /api/v1/announcements with repeated
 * context_codes[] params; active_only skips scheduled-but-unposted ones.
 */
/**
 * The caller's own graded submissions for one Canvas course, assignment context
 * included. Only rows Canvas itself calls graded, with a posted (visible) score --
 * a muted/pending grade must not be staged as if it were real.
 */
export async function listGradedSubmissions(
  baseUrl: string,
  token: string,
  canvasCourseId: number,
): Promise<CanvasSubmission[]> {
  const raw = await canvasGetAll(
    baseUrl,
    token,
    `/api/v1/courses/${canvasCourseId}/students/submissions?student_ids[]=self&include[]=assignment&per_page=50`,
  );
  const out: CanvasSubmission[] = [];
  for (const value of raw) {
    if (typeof value !== "object" || value == null) continue;
    const v = value as Record<string, unknown>;
    if (v.workflow_state !== "graded" || typeof v.score !== "number") continue;
    if (v.posted_at == null) continue; // grade exists but is hidden from the student
    const assignment = v.assignment as Record<string, unknown> | undefined;
    if (assignment == null || typeof assignment.id !== "number") continue;
    out.push({
      assignmentId: assignment.id,
      assignmentName: typeof assignment.name === "string" ? assignment.name : "(unnamed assignment)",
      score: v.score,
      pointsPossible: typeof assignment.points_possible === "number" ? assignment.points_possible : null,
      gradedAt: typeof v.graded_at === "string" ? v.graded_at : null,
    });
  }
  return out;
}

export async function listAnnouncements(
  baseUrl: string,
  token: string,
  contextCodes: string[],
  startDateIso: string,
): Promise<CanvasAnnouncement[]> {
  if (contextCodes.length === 0) return [];
  const params = new URLSearchParams();
  for (const code of contextCodes) params.append("context_codes[]", code);
  params.set("start_date", startDateIso);
  params.set("active_only", "true");
  params.set("per_page", "50");

  const raw = await canvasGetAll(baseUrl, token, `/api/v1/announcements?${params.toString()}`);
  const out: CanvasAnnouncement[] = [];
  for (const value of raw) {
    if (typeof value !== "object" || value == null) continue;
    const v = value as Record<string, unknown>;
    if (typeof v.id !== "number" || typeof v.context_code !== "string") continue;
    out.push({
      id: v.id,
      title: typeof v.title === "string" ? v.title : "(untitled)",
      message: stripCanvasHtml(typeof v.message === "string" ? v.message : ""),
      postedAt: typeof v.posted_at === "string" ? v.posted_at : null,
      contextCode: v.context_code,
    });
  }
  return out;
}
