import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import { invokeEdgeFunction } from './invoke';

/**
 * Canvas conversion data layer (docs/CANVAS_AUDIT.md). The token itself never touches
 * this package beyond the connect call's pass-through to the edge function -- storage
 * is Vault-side (F3), and reads happen only inside canvas-sync.
 */

export type CanvasConnectionRow = Database['public']['Tables']['canvas_connections']['Row'];
export type CanvasCourseLinkRow = Database['public']['Tables']['canvas_course_links']['Row'];

export interface CanvasCourseOption {
  id: number;
  name: string;
  courseCode: string;
}

export interface ConnectCanvasResult {
  connected: boolean;
  canvasUser: string;
  courses: CanvasCourseOption[];
}

export async function connectCanvas(
  client: TypedSupabaseClient,
  input: { baseUrl: string; token: string },
): Promise<DataResult<ConnectCanvasResult>> {
  return invokeEdgeFunction<ConnectCanvasResult>(client, 'canvas-sync', input);
}

export interface CanvasCourseLinkInput {
  courseId: number;
  canvasCourseId: number;
  canvasCourseName: string;
}

export async function saveCanvasCourseLinks(
  client: TypedSupabaseClient,
  links: CanvasCourseLinkInput[],
): Promise<DataResult<{ saved: number }>> {
  return invokeEdgeFunction<{ saved: number }>(client, 'canvas-sync', { links });
}

export type CanvasSyncOutcome =
  | { kind: 'notConnected' | 'noLinks' | 'noToken' }
  | {
      kind: 'polled';
      fetched: number;
      staged: number;
      skippedExisting: number;
      skippedUnmapped: number;
      parsed: number;
      unparsed: number;
    };

export async function syncCanvasNow(client: TypedSupabaseClient): Promise<DataResult<CanvasSyncOutcome>> {
  return invokeEdgeFunction<CanvasSyncOutcome>(client, 'canvas-sync', {});
}

export interface CanvasStatus {
  connection: CanvasConnectionRow | null;
  links: CanvasCourseLinkRow[];
}

export async function getCanvasStatus(client: TypedSupabaseClient, userId: string): Promise<DataResult<CanvasStatus>> {
  const { data: connection, error: connError } = await client
    .from('canvas_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (connError) return dataErr(mapDataError(connError));
  const { data: links, error: linksError } = await client
    .from('canvas_course_links')
    .select('*')
    .eq('user_id', userId)
    .order('canvas_course_name');
  if (linksError) return dataErr(mapDataError(linksError));
  return dataOk({ connection: connection ?? null, links: links ?? [] });
}

export interface ReviewableAnnouncement {
  id: number;
  courseId: number;
  status: string;
  source: string;
  rawText: string;
  createdAt: string;
  failureReason: string | null;
}

/**
 * Staged announcements awaiting a human: parsed (diff ready to review), pending (poll
 * staged it but no key parsed it yet), failed (needs a re-parse). Applied/rejected/
 * no-schedulable-content rows are done and stay out -- this is a worklist, not history.
 */
export async function listReviewableAnnouncements(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<ReviewableAnnouncement[]>> {
  const { data, error } = await client
    .from('announcements')
    .select('id, course_id, status, source, raw_text, created_at, failure_reason')
    .eq('user_id', userId)
    .in('status', ['parsed', 'pending', 'failed'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return dataErr(mapDataError(error));
  return dataOk(
    (data ?? []).map((row) => ({
      id: row.id,
      courseId: row.course_id,
      status: row.status,
      source: row.source,
      rawText: row.raw_text,
      createdAt: row.created_at,
      failureReason: row.failure_reason,
    })),
  );
}

export type CanvasGradeExtractionRow = Database['public']['Tables']['canvas_grade_extractions']['Row'];

/** Staged Canvas grades still awaiting the user's decision, for one course's panel. */
export async function listPendingGradeExtractionsForCourse(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
): Promise<DataResult<CanvasGradeExtractionRow[]>> {
  const { data, error } = await client
    .from('canvas_grade_extractions')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('status', 'pending')
    .order('graded_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export type CanvasGradeDecisionResult =
  | { kind: 'applied'; gradeItemId: number; scorePct: number | null }
  | { kind: 'rejected' };

/** The one path from a staged Canvas grade to the Ledger -- server-side, refusals
 *  precise and re-editable (a 422 names exactly what to fix). */
export async function decideCanvasGrade(
  client: TypedSupabaseClient,
  input: { extractionId: number; decision: 'applied' | 'rejected'; gradeItemId?: number },
): Promise<DataResult<CanvasGradeDecisionResult>> {
  return invokeEdgeFunction<CanvasGradeDecisionResult>(client, 'canvas-sync', { gradeDecision: input });
}

/** Full teardown: the Vault token (via the shared disconnect RPC) plus the connection
 *  row and course links. Staged/applied announcements stay -- they are the user's data,
 *  produced with their consent, same as calendar_events surviving a Brightspace
 *  disconnect. */
export async function disconnectCanvas(client: TypedSupabaseClient, userId: string): Promise<DataResult<boolean>> {
  const { error: rpcError } = await client.rpc('disconnect_oauth_connection', { p_user_id: userId, p_provider: 'canvas' });
  if (rpcError) return dataErr(mapDataError(rpcError));
  const { error: linksError } = await client.from('canvas_course_links').delete().eq('user_id', userId);
  if (linksError) return dataErr(mapDataError(linksError));
  const { error: connError } = await client.from('canvas_connections').delete().eq('user_id', userId);
  if (connError) return dataErr(mapDataError(connError));
  return dataOk(true);
}
