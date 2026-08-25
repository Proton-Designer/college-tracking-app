import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import { invokeEdgeFunction } from './invoke';

export type SyllabusExtractionRow = Database['public']['Tables']['syllabus_extractions']['Row'];

/** Staged extractions for one upload, awaiting review -- what the confirm/review UI
 *  reads. Never promoted into courses/deliverables/grade_categories from here; that only
 *  ever happens through the syllabus-confirm Edge Function (see confirmSyllabusExtraction
 *  below), which is the one place law #3 (extracted deadlines require explicit user
 *  confirmation) is actually enforced -- RLS would let this client write those tables
 *  directly, so a client-side confirmation check would be advisory only. */
export async function listSyllabusExtractions(
  client: TypedSupabaseClient,
  uploadId: number,
): Promise<DataResult<SyllabusExtractionRow[]>> {
  const { data, error } = await client
    .from('syllabus_extractions')
    .select('*')
    .eq('upload_id', uploadId)
    .order('created_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Every Edge Function in this codebase wraps its body in {ok, data} or {ok, error}
 *  (supabase/functions/_shared/http.ts's apiOk/apiErr) -- client.functions.invoke's own
 *  `data` is that whole envelope, not the payload directly (found live in
 *  accountManagement.ts; same fix here). */
function unwrapEnvelope<T>(body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  if (body != null && typeof body === 'object' && 'ok' in body) {
    return body as { ok: true; data: T } | { ok: false; error: string };
  }
  return { ok: false, error: 'Malformed response from server.' };
}

export interface TriggerSyllabusExtractionResult {
  uploadId: number;
  itemCount: number;
}

/** Runs extraction for an already-uploaded syllabus file (uploadSyllabus). If the
 *  server has no ANTHROPIC_API_KEY configured, this returns a real, explicit error
 *  ("Syllabus extraction is not yet configured on this server...") rather than a
 *  spinner that never resolves or a fabricated result -- the caller must surface that
 *  message as-is, not paper over it with a generic "try again." */
export async function triggerSyllabusExtraction(
  client: TypedSupabaseClient,
  uploadId: number,
): Promise<DataResult<TriggerSyllabusExtractionResult>> {
  const result = await invokeEdgeFunction<{ kind: 'staged'; uploadId: number; itemCount: number }>(
    client,
    'syllabus-extract',
    { uploadId },
  );
  if (!result.ok) return result;
  return dataOk({ uploadId: result.data.uploadId, itemCount: result.data.itemCount });
}

export interface ConfirmSyllabusExtractionInput {
  extractionId: number;
  courseId?: number;
  decision: 'confirmed' | 'edited' | 'rejected';
  /** Only meaningful with decision:'edited' -- the server re-validates whatever's here
   *  against the same schema the original extraction was checked against; it never
   *  trusts the edited content just because a user touched it. */
  editedPayload?: Record<string, unknown>;
}

export type ConfirmSyllabusExtractionResult =
  | { action: 'rejected' }
  | { action: 'promoted'; courseId?: number; deliverableId?: number; gradeCategoryId?: number };

/** The ONLY path from a staged syllabus_extractions row to a real courses/deliverables/
 *  grade_categories write -- syllabus-confirm Edge Function, never a direct client
 *  write. See supabase/functions/syllabus-confirm/index.ts's own header comment for why
 *  this is deployed server-side rather than left to the client. */
export async function confirmSyllabusExtraction(
  client: TypedSupabaseClient,
  input: ConfirmSyllabusExtractionInput,
): Promise<DataResult<ConfirmSyllabusExtractionResult>> {
  return invokeEdgeFunction<ConfirmSyllabusExtractionResult>(client, 'syllabus-confirm', { ...input });
}
