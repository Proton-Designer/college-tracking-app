import {
  addDays,
  buildSeries,
  isWeekOutstanding,
  screenTimeDriftSignal,
  summariseSeries,
  unresolvedFields,
  type ConfirmedWeek,
  type LocalDate,
  type SeriesSummary,
  type StagedValue,
  type WeekPoint,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import { invokeEdgeFunction } from './invoke';

/**
 * Weekly screen time's data layer (D51). Self-reported by screenshot, because iOS does not expose
 * Screen Time to third-party apps — and better for it: the upload is the intervention, the number
 * is only the record.
 *
 * Three rules from D51 live at this boundary, and none of them is negotiable downstream:
 *
 * 1. **A missed week is a GAP, not a broken streak.** There is no consecutive-week counter in this
 *    file, in `packages/core/src/screentime/series.ts`, or in the schema. `buildSeries` hands back
 *    `minutes: null` for an unreported week and every chart must render that as a hole. A zero
 *    would claim the phone was untouched; null says nobody reported, which is the truth.
 *
 * 2. **The no-guessing rule (D10) at the confirm boundary.** A value the model could not read
 *    lands staged as `minutes = null, needs_input = true` — the schema's
 *    `screen_time_extractions_value_or_prompt` CHECK makes the two mutually exclusive — and
 *    `confirmScreenTimeWeek` refuses to promote a week while any such field is outstanding. It
 *    returns the fields themselves rather than a boolean, so the surface can point at them instead
 *    of refusing with a message.
 *
 * 3. **Nothing reaches `screen_time_weeks` without an explicit user confirmation.** The parse edge
 *    function stages and never writes the confirmed table; `confirmScreenTimeWeek` below is its
 *    only writer, and it is only ever called from a confirm gesture.
 *
 * C9 also holds here: every read and write is single-owner. There is no sharing flag on any of
 * these three tables and nothing in this module is designed toward one.
 */

export type ScreenTimeUploadRow = Database['public']['Tables']['screen_time_uploads']['Row'];
export type ScreenTimeExtractionRow = Database['public']['Tables']['screen_time_extractions']['Row'];
export type ScreenTimeWeekRow = Database['public']['Tables']['screen_time_weeks']['Row'];

/**
 * The private bucket the screenshot lands in.
 *
 * `syllabi` rather than a bucket of its own, and that is a constraint rather than a choice:
 * migration 64 defines the three screen-time tables but no bucket, and the migrations are settled.
 * This bucket is private, allows `image/png` and `image/jpeg`, and its RLS policy requires the
 * owner's id as the first path segment — the same three properties a dedicated bucket would have
 * had. When a `screen-time` bucket is added, this constant and `buildScreenTimeStoragePath` are
 * the only two things that change.
 */
export const SCREEN_TIME_BUCKET = 'syllabi';

/** How many weeks the series covers by default. A quarter of weeks: long enough for a rise to be a
 *  rise rather than a busy fortnight, short enough that the holes stay legible. */
export const SCREEN_TIME_SERIES_WEEKS = 12;

/**
 * `<user_id>/screen-time-<week>-<ts>.<ext>` — deliberately FLAT under the owner prefix, not in a
 * `screen-time/` subfolder. `account-delete` and `account-export` both enumerate a bucket with a
 * non-recursive `list(userId)`, so a file one level deeper would be invisible to the deletion path
 * and would survive an account delete. A nested folder here would be a data-retention bug, not a
 * tidier layout.
 */
export function buildScreenTimeStoragePath(
  userId: string,
  weekStartDate: LocalDate,
  fileName: string,
): string {
  const extension = /\.(png|jpe?g)$/i.exec(fileName)?.[0]?.toLowerCase() ?? '.png';
  return `${userId}/screen-time-${weekStartDate}-${Date.now()}${extension}`;
}

// ---------------------------------------------------------------------------
// The upload
// ---------------------------------------------------------------------------

export interface CreateScreenTimeUploadInput {
  /** The Sunday the week starts on — `startOfWeek` from the user's LOCAL today, never UTC's. */
  weekStartDate: LocalDate;
  file: Blob | ArrayBuffer | Uint8Array;
  fileName: string;
  /** The bucket checks the DECLARED content type, not the bytes, so a raw buffer must say what it
   *  is or it defaults to text/plain and is rejected outright (see `uploadSyllabus`). */
  contentType?: string;
}

/**
 * Puts the screenshot in storage and opens (or reopens) the week's upload row.
 *
 * Re-uploading a week REPLACES its staging rather than accumulating uploads nobody can tell apart
 * — migration 64's `screen_time_uploads_one_per_week` is the enforcement and this upsert is the
 * behaviour. The confirmed series is a separate table and survives untouched: someone re-reading a
 * blurry screenshot is correcting the reading, not retracting the week.
 */
export async function createScreenTimeUpload(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateScreenTimeUploadInput,
): Promise<DataResult<ScreenTimeUploadRow>> {
  const { data: existing, error: existingError } = await client
    .from('screen_time_uploads')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('week_start_date', input.weekStartDate)
    .maybeSingle();
  if (existingError) return dataErr(mapDataError(existingError));

  const storagePath = buildScreenTimeStoragePath(userId, input.weekStartDate, input.fileName);
  const { error: uploadError } = await client.storage
    .from(SCREEN_TIME_BUCKET)
    .upload(storagePath, input.file, { contentType: input.contentType ?? 'image/png' });
  if (uploadError) return dataErr({ code: 'unknown', message: uploadError.message });

  const { data, error } = await client
    .from('screen_time_uploads')
    .upsert(
      {
        user_id: userId,
        week_start_date: input.weekStartDate,
        storage_path: storagePath,
        status: 'pending',
        error_message: null,
      },
      { onConflict: 'user_id,week_start_date' },
    )
    .select('*')
    .single();
  if (error) {
    // The row is what the parse actually needs — don't leave an orphaned image with nothing
    // pointing at it (`uploadSyllabus`'s reasoning, same failure).
    await client.storage.from(SCREEN_TIME_BUCKET).remove([storagePath]);
    return dataErr(mapDataError(error));
  }

  if (existing != null) {
    // The previous read of this week is superseded, not history: leaving its rows behind would
    // show the user two contradictory readings of one screenshot with no way to tell which is
    // current. The old image goes with them, best-effort — a leftover file is a smaller problem
    // than a failed re-upload, so its removal never fails the call.
    await client.from('screen_time_extractions').delete().eq('user_id', userId).eq('upload_id', existing.id);
    if (existing.storage_path !== storagePath) {
      await client.storage.from(SCREEN_TIME_BUCKET).remove([existing.storage_path]);
    }
  }

  return dataOk(data);
}

/** This week's upload, or null when the week has not been uploaded. Null is a real state — it is
 *  what makes the review step an invitation rather than a task. */
export async function getScreenTimeUpload(
  client: TypedSupabaseClient,
  userId: string,
  weekStartDate: LocalDate,
): Promise<DataResult<ScreenTimeUploadRow | null>> {
  const { data, error } = await client
    .from('screen_time_uploads')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Runs the parse for an already-uploaded screenshot.
 *
 * If the server has no `ANTHROPIC_API_KEY`, this returns a real, explicit error rather than a
 * spinner that never resolves or a fabricated reading — and the caller must surface that message
 * as-is (`triggerSyllabusExtraction`'s rule, same reason).
 */
export async function triggerScreenTimeParse(
  client: TypedSupabaseClient,
  uploadId: number,
): Promise<DataResult<{ uploadId: number; itemCount: number; needsInputCount: number }>> {
  return invokeEdgeFunction<{ uploadId: number; itemCount: number; needsInputCount: number }>(
    client,
    'screen-time-parse',
    { uploadId },
  );
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

/**
 * The staged rows for one upload — what the confirm UI reads.
 *
 * These are a PROPOSAL. Nothing here is a fact about the week until `confirmScreenTimeWeek` runs,
 * and a row with `needs_input` is not a fact at all: it is a question the model is handing back.
 */
export async function listScreenTimeExtractions(
  client: TypedSupabaseClient,
  uploadId: number,
): Promise<DataResult<ScreenTimeExtractionRow[]>> {
  const { data, error } = await client
    .from('screen_time_extractions')
    .select('*')
    .eq('upload_id', uploadId)
    .order('item_type', { ascending: true })
    .order('id', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

// ---------------------------------------------------------------------------
// Confirmation -- the only writer of the confirmed series
// ---------------------------------------------------------------------------

export interface ScreenTimeFieldInput {
  extractionId: number;
  /** What the user has in front of them. A blank stays `null` — it never becomes a zero on the way
   *  through this function, which is the whole of the no-guessing rule at this layer. */
  minutes: number | null;
  /** A label the user corrected. Absent leaves the staged label alone. */
  label?: string | null;
}

export interface UnresolvedScreenTimeField {
  extractionId: number;
  label: string | null;
  itemType: string;
}

export type ConfirmScreenTimeWeekResult =
  | { kind: 'blocked'; unresolved: UnresolvedScreenTimeField[] }
  | { kind: 'confirmed'; week: ScreenTimeWeekRow };

export interface ConfirmScreenTimeWeekInput {
  uploadId: number;
  /** The user's resolved values, one per staged row they touched. Rows not named here keep what
   *  was staged — which for a `needs_input` row means it is still unresolved and still blocks. */
  fields?: ScreenTimeFieldInput[];
}

/**
 * Promotes one week's staged reading into the confirmed series.
 *
 * **This is the only path from a staged row to `screen_time_weeks`.** The parse function stages and
 * never writes here (the syllabus extract/confirm split, applied to the same pipeline), so this
 * function is where D10 is actually enforced: no number becomes real without a person confirming
 * it.
 *
 * A `blocked` result is not an error — it is the honest answer to "can this be confirmed yet", with
 * the outstanding fields named so the surface can point at them. `unresolvedFields` in
 * `packages/core` decides what counts as outstanding, so web and mobile block on exactly the same
 * rows.
 */
export async function confirmScreenTimeWeek(
  client: TypedSupabaseClient,
  userId: string,
  input: ConfirmScreenTimeWeekInput,
): Promise<DataResult<ConfirmScreenTimeWeekResult>> {
  const { data: upload, error: uploadError } = await client
    .from('screen_time_uploads')
    .select('*')
    .eq('id', input.uploadId)
    .eq('user_id', userId)
    .maybeSingle();
  if (uploadError) return dataErr(mapDataError(uploadError));
  if (upload == null) return dataErr({ code: 'not_found', message: 'That upload could not be found.' });

  const stagedResult = await listScreenTimeExtractions(client, input.uploadId);
  if (!stagedResult.ok) return stagedResult;
  if (stagedResult.data.length === 0) {
    return dataErr({
      code: 'validation',
      message: 'There is nothing staged for this week yet — run the parse first.',
    });
  }

  const edits = new Map((input.fields ?? []).map((f) => [f.extractionId, f]));

  // The user's edits applied over the staged rows, in the shape core's rule reads. `needsInput`
  // becomes false only when a real number is present: filling a field is what resolves it, and
  // nothing else does.
  const resolved = stagedResult.data.map((row) => {
    const edit = edits.get(row.id);
    const minutes = edit === undefined ? row.minutes : edit.minutes;
    const label = edit?.label !== undefined ? edit.label : row.label;
    const staged: StagedValue = { label, minutes, needsInput: minutes == null };
    return { row, minutes, label, staged, edited: edit !== undefined };
  });

  const byStaged = new Map(resolved.map((r) => [r.staged, r]));
  const outstanding = unresolvedFields(resolved.map((r) => r.staged));
  if (outstanding.length > 0) {
    return dataOk({
      kind: 'blocked',
      unresolved: outstanding.map((staged) => {
        const entry = byStaged.get(staged)!;
        return { extractionId: entry.row.id, label: entry.label, itemType: entry.row.item_type };
      }),
    });
  }

  const total = resolved.find((r) => r.row.item_type === 'total');
  if (total == null || total.minutes == null) {
    return dataErr({
      code: 'validation',
      message: "This week's daily average is missing from the reading — re-upload the screenshot.",
    });
  }

  const breakdown: Record<string, number> = {};
  for (const entry of resolved) {
    if (entry.row.item_type === 'total' || entry.minutes == null) continue;
    const key = entry.label?.trim();
    if (key == null || key.length === 0) continue;
    breakdown[key] = entry.minutes;
  }

  const confirmedAt = new Date().toISOString();

  // Written before the week row so a failure here can never leave a confirmed week whose staging
  // still reads "pending" — the direction that would let a second confirm double-write.
  for (const entry of resolved) {
    const { error } = await client
      .from('screen_time_extractions')
      .update({
        minutes: entry.minutes,
        needs_input: false,
        label: entry.label,
        status: entry.edited ? 'edited' : 'confirmed',
        confirmed_at: confirmedAt,
      })
      .eq('id', entry.row.id)
      .eq('user_id', userId);
    if (error) return dataErr(mapDataError(error));
  }

  const { data: week, error: weekError } = await client
    .from('screen_time_weeks')
    .upsert(
      {
        user_id: userId,
        week_start_date: upload.week_start_date,
        daily_average_minutes: total.minutes,
        breakdown,
        confirmed_at: confirmedAt,
      },
      { onConflict: 'user_id,week_start_date' },
    )
    .select('*')
    .single();
  if (weekError) return dataErr(mapDataError(weekError));

  const { error: statusError } = await client
    .from('screen_time_uploads')
    .update({ status: 'confirmed' })
    .eq('id', upload.id)
    .eq('user_id', userId);
  if (statusError) return dataErr(mapDataError(statusError));

  return dataOk({ kind: 'confirmed', week });
}

// ---------------------------------------------------------------------------
// The confirmed series
// ---------------------------------------------------------------------------

/** Confirmed weeks from `from` forward, oldest first. */
export async function listScreenTimeWeeks(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
): Promise<DataResult<ScreenTimeWeekRow[]>> {
  const { data, error } = await client
    .from('screen_time_weeks')
    .select('*')
    .eq('user_id', userId)
    .gte('week_start_date', from)
    .order('week_start_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export interface ScreenTimeSeries {
  /** Oldest first, one entry per calendar week in the window. `minutes: null` is a week nobody
   *  reported — a hole. Never interpolated, never rendered as 0, and never counted against
   *  anything. */
  points: WeekPoint[];
  summary: SeriesSummary;
  /** The Focus-dimension drift input (D50's trigger table gains this one). Null unless there are
   *  four reported weeks AND the latest is a quarter above the user's OWN baseline — there is no
   *  defensible external norm for minutes on a phone and this app has no business implying one. */
  drift: { risePercent: number } | null;
}

function toConfirmedWeek(row: ScreenTimeWeekRow): ConfirmedWeek {
  const raw = row.breakdown;
  const breakdown: Record<string, number> = {};
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) breakdown[key] = value;
    }
  }
  return {
    weekStartDate: row.week_start_date,
    dailyAverageMinutes: row.daily_average_minutes,
    breakdown,
  };
}

/**
 * The weekly series over the last `weeks` weeks, with its gaps intact.
 *
 * Every number comes from `packages/core`: `buildSeries` places the weeks and the holes,
 * `summariseSeries` computes the average and the delta between the two most recent REPORTED weeks,
 * `screenTimeDriftSignal` decides whether there is anything to say at all. This module reads rows
 * and converts column names; it computes nothing.
 */
export async function loadScreenTimeSeries(
  client: TypedSupabaseClient,
  userId: string,
  currentWeekStart: LocalDate,
  weeks: number = SCREEN_TIME_SERIES_WEEKS,
): Promise<DataResult<ScreenTimeSeries>> {
  const from = addDays(currentWeekStart, -7 * (weeks - 1));
  const rows = await listScreenTimeWeeks(client, userId, from);
  if (!rows.ok) return rows;

  const points = buildSeries(rows.data.map(toConfirmedWeek), currentWeekStart, weeks);
  return dataOk({
    points,
    summary: summariseSeries(points),
    drift: screenTimeDriftSignal(points),
  });
}

// ---------------------------------------------------------------------------
// The assembled read -- what the Sunday review's step needs
// ---------------------------------------------------------------------------

export interface ScreenTimeStepView {
  weekStart: LocalDate;
  /**
   * Whether this week's screenshot is still owed. The surface renders this as an INVITATION and
   * nothing else: no badge, no counter, no escalation. A week that is never uploaded stays owed
   * forever without becoming louder, because there is nothing to escalate to — the series just has
   * a hole (D51).
   */
  outstanding: boolean;
  /** The week's upload, if one has been started. */
  upload: ScreenTimeUploadRow | null;
  /** The staged reading awaiting confirmation. Empty until a parse has run. */
  staged: ScreenTimeExtractionRow[];
  /** The staged rows the user still has to fill, decided by core so both platforms block on the
   *  same ones. Empty when the reading is ready to confirm. */
  unresolved: UnresolvedScreenTimeField[];
  series: ScreenTimeSeries;
}

/**
 * Everything the Sunday review's screen-time step renders, in one call.
 *
 * Assembled here rather than in either shell so web and mobile cannot disagree about whether a week
 * is outstanding or whether a reading can be confirmed — and so neither shell has to know that
 * "outstanding" is a question about the confirmed table rather than about the upload.
 */
export async function loadScreenTimeStep(
  client: TypedSupabaseClient,
  userId: string,
  weekStart: LocalDate,
  weeks: number = SCREEN_TIME_SERIES_WEEKS,
): Promise<DataResult<ScreenTimeStepView>> {
  const [seriesResult, uploadResult] = await Promise.all([
    loadScreenTimeSeries(client, userId, weekStart, weeks),
    getScreenTimeUpload(client, userId, weekStart),
  ]);
  if (!seriesResult.ok) return seriesResult;
  if (!uploadResult.ok) return uploadResult;

  const upload = uploadResult.data;
  let staged: ScreenTimeExtractionRow[] = [];
  if (upload != null && upload.status !== 'confirmed') {
    const stagedResult = await listScreenTimeExtractions(client, upload.id);
    if (!stagedResult.ok) return stagedResult;
    staged = stagedResult.data;
  }

  const stagedValues: StagedValue[] = staged.map((row) => ({
    label: row.label,
    minutes: row.minutes,
    needsInput: row.needs_input,
  }));
  const byValue = new Map(stagedValues.map((value, i) => [value, staged[i]!]));

  // `isWeekOutstanding` asks the CONFIRMED series, not the upload: a screenshot sitting in staging
  // is a week still owed, because nothing about it is true yet.
  const confirmed = seriesResult.data.points
    .filter((p): p is WeekPoint & { minutes: number } => p.minutes !== null)
    .map((p) => ({ weekStartDate: p.weekStartDate, dailyAverageMinutes: p.minutes, breakdown: {} }));

  return dataOk({
    weekStart,
    outstanding: isWeekOutstanding(confirmed, weekStart),
    upload,
    staged,
    unresolved: unresolvedFields(stagedValues).map((value) => {
      const row = byValue.get(value)!;
      return { extractionId: row.id, label: row.label, itemType: row.item_type };
    }),
    series: seriesResult.data,
  });
}
