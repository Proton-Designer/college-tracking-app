import {
  addDays,
  compareLocalDate,
  driftLine as composeDriftLine,
  isMomReviewDue,
  momCountdown,
  resolveChain,
  unanchoredOverWindow,
  type ChainLayer,
  type ChainSource,
  type LocalDate,
  type MomCountdown,
  unanchoredCount,
  type UnanchoredReport,
  type WindowItem,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import type { GoalRow } from './goals';

/**
 * The vision chain's data layer (D48).
 *
 * **Every upward link this module writes is optional and stays optional.** Nothing here refuses a
 * write because a parent is missing, nothing backfills a parent, and nothing picks one on the
 * user's behalf. An item that traces to nothing is `unanchored` — a state `loadVisionChain`
 * counts and names, never one it prevents.
 *
 * **All arithmetic is `packages/core`'s.** Countdowns, drift counts and the drift sentence come
 * from `vision/chain`, so web and mobile cannot disagree about the same chain and the copy exists
 * in exactly one place.
 */

export type VisionRow = Database['public']['Tables']['visions']['Row'];
export type BeachheadRow = Database['public']['Tables']['beachheads']['Row'];
export type MissionRow = Database['public']['Tables']['missions']['Row'];
export type MomRow = Database['public']['Tables']['moms']['Row'];
export type MomReviewRow = Database['public']['Tables']['mom_reviews']['Row'];
export type MomOutcome = Database['public']['Enums']['mom_outcome'];

/** The six mandates, as the source module names them. Sections of one statement, not six records. */
export const VISION_MANDATES = [
  'financial',
  'professional',
  'physical',
  'relational',
  'family',
  'environmental',
] as const;

export type VisionMandate = (typeof VISION_MANDATES)[number];

export const VISION_MANDATE_LABELS: Readonly<Record<VisionMandate, string>> = {
  financial: 'Financial',
  professional: 'Professional',
  physical: 'Physical',
  relational: 'Relational',
  family: 'Family',
  environmental: 'Environmental',
};

const MANDATE_COLUMNS: Readonly<Record<VisionMandate, keyof VisionRow>> = {
  financial: 'mandate_financial',
  professional: 'mandate_professional',
  physical: 'mandate_physical',
  relational: 'mandate_relational',
  family: 'mandate_family',
  environmental: 'mandate_environmental',
};

/** How far back the drift window reaches by default — one week, the Sunday review's own span. */
const DEFAULT_DRIFT_WINDOW_DAYS = 7;

// ============================================================================
// The 10-Year Vision
// ============================================================================

export interface SaveVisionInput {
  body: string;
  /** The optional per-mandate breakdown. Absent keys are left alone; explicit null clears one. */
  mandates?: Partial<Record<VisionMandate, string | null>>;
}

// @barrel-internal -- read by saveVision and loadChainSource inside this module; every surface
// reads the vision through loadVisionChain instead, so there is no second way to fetch it.
export async function getActiveVision(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<VisionRow | null>> {
  const { data, error } = await client
    .from('visions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Writes the active vision — creating the first one, or editing the one that exists.
 *
 * In place rather than append-per-edit: a person refines this wording many times, and a new row
 * per comma would bury the one rewrite that mattered. Rewriting the statement entirely is the same
 * act as far as this function is concerned — the `active` flag and its partial unique index exist
 * so a retire-and-rewrite path can be added later without a migration, and until that path has a
 * surface to read the retired statement on, there is no writer for it.
 */
export async function saveVision(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveVisionInput,
): Promise<DataResult<VisionRow>> {
  const body = input.body.trim();
  if (body.length === 0) {
    return dataErr({ code: 'validation', message: 'A vision needs something written in it.' });
  }

  const mandatePatch: Record<string, string | null> = {};
  for (const mandate of VISION_MANDATES) {
    const value = input.mandates?.[mandate];
    if (value === undefined) continue;
    const trimmed = value === null ? null : value.trim();
    mandatePatch[MANDATE_COLUMNS[mandate]] = trimmed === '' ? null : trimmed;
  }

  const existing = await getActiveVision(client, userId);
  if (!existing.ok) return existing;

  if (existing.data != null) {
    const { data, error } = await client
      .from('visions')
      .update({ body, ...mandatePatch })
      .eq('id', existing.data.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return dataErr(mapDataError(error));
    return dataOk(data);
  }

  const { data, error } = await client
    .from('visions')
    .insert({ user_id: userId, body, ...mandatePatch })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ============================================================================
// Beachhead · Mission · M.O.M.
// ============================================================================

/**
 * The shape all three middle layers share.
 *
 * `id` present means edit; absent means create. `parentId` is `undefined` to leave a link alone
 * and `null` to cut it — cutting is a real edit, not an omission, and the two must not collapse.
 */
export interface SaveChainNodeInput {
  id?: number;
  title: string;
  target?: string | null;
  startsOn?: LocalDate | null;
  endsOn?: LocalDate | null;
  parentId?: number | null;
}

/** The columns the three layers share, named as they are in the schema. */
interface ChainNodePatch {
  title: string;
  target?: string | null;
  starts_on?: LocalDate | null;
  ends_on?: LocalDate | null;
}

/**
 * Validates and shapes the columns common to all three middle layers. The parent FK is applied by
 * each caller, because `vision_id` / `beachhead_id` / `mission_id` are three different columns and
 * a stringly-typed patch would give up exactly the checking that keeps the chain pointing where it
 * can mean something.
 */
function chainNodePatch(input: SaveChainNodeInput): DataResult<ChainNodePatch> {
  const title = input.title.trim();
  if (title.length === 0) {
    return dataErr({ code: 'validation', message: 'Give this a title before saving it.' });
  }
  if (input.startsOn != null && input.endsOn != null && compareLocalDate(input.endsOn, input.startsOn) < 0) {
    return dataErr({ code: 'validation', message: 'The end date is before the start date.' });
  }

  const patch: ChainNodePatch = { title };
  if (input.target !== undefined) {
    const trimmed = input.target === null ? null : input.target.trim();
    patch.target = trimmed === '' ? null : trimmed;
  }
  if (input.startsOn !== undefined) patch.starts_on = input.startsOn;
  if (input.endsOn !== undefined) patch.ends_on = input.endsOn;
  return dataOk(patch);
}

/** Creates or edits the active 3-year Beachhead. `parentId` is the vision it steps down from. */
export async function saveBeachhead(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveChainNodeInput,
): Promise<DataResult<BeachheadRow>> {
  const base = chainNodePatch(input);
  if (!base.ok) return base;
  const patch = { ...base.data, ...(input.parentId !== undefined ? { vision_id: input.parentId } : {}) };

  if (input.id != null) {
    const { data, error } = await client
      .from('beachheads')
      .update(patch)
      .eq('id', input.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return dataErr(mapDataError(error));
    return dataOk(data);
  }

  const { data, error } = await client
    .from('beachheads')
    .insert({ user_id: userId, ...patch })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Creates or edits the active 1-year Mission. `parentId` is the beachhead above it. */
export async function saveMission(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveChainNodeInput,
): Promise<DataResult<MissionRow>> {
  const base = chainNodePatch(input);
  if (!base.ok) return base;
  const patch = { ...base.data, ...(input.parentId !== undefined ? { beachhead_id: input.parentId } : {}) };

  if (input.id != null) {
    const { data, error } = await client
      .from('missions')
      .update(patch)
      .eq('id', input.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return dataErr(mapDataError(error));
    return dataOk(data);
  }

  const { data, error } = await client
    .from('missions')
    .insert({ user_id: userId, ...patch })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Creates or edits the active 90-day M.O.M. `parentId` is the mission above it. */
export async function saveMom(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveChainNodeInput,
): Promise<DataResult<MomRow>> {
  const base = chainNodePatch(input);
  if (!base.ok) return base;
  const patch = { ...base.data, ...(input.parentId !== undefined ? { mission_id: input.parentId } : {}) };

  if (input.id != null) {
    const { data, error } = await client
      .from('moms')
      .update(patch)
      .eq('id', input.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return dataErr(mapDataError(error));
    return dataOk(data);
  }

  const { data, error } = await client
    .from('moms')
    .insert({ user_id: userId, ...patch })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** The active M.O.M., or null. Null is a real state — no M.O.M. has been set yet. */
export async function getActiveMom(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<MomRow | null>> {
  const { data, error } = await client
    .from('moms')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ============================================================================
// Anchoring
// ============================================================================

/**
 * Points a task at a M.O.M., or cuts the link with `null`.
 *
 * There is no validation beyond ownership, deliberately: attaching is optional, detaching is
 * always allowed, and an MIT that answers to nothing is a supported state rather than a lapse.
 */
export async function setTaskAnchor(
  client: TypedSupabaseClient,
  userId: string,
  taskId: number,
  momId: number | null,
): Promise<DataResult<{ taskId: number; momId: number | null }>> {
  const { error } = await client
    .from('tasks')
    .update({ mom_id: momId })
    .eq('id', taskId)
    .eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk({ taskId, momId });
}

/** Points a War Map goal at a M.O.M., or cuts the link with `null`. Same rules as a task. */
export async function setGoalAnchor(
  client: TypedSupabaseClient,
  userId: string,
  goalId: number,
  momId: number | null,
): Promise<DataResult<GoalRow>> {
  const { data, error } = await client
    .from('goals')
    .update({ mom_id: momId })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ============================================================================
// Drift
// ============================================================================

/**
 * The unanchored MITs over a window, as a count with its items nameable.
 *
 * Scoped to MITs (`mit_rank is not null`) rather than every task: the MIT is the one thing the
 * Night Plan asks a person to choose on purpose, so it is the only item where "what did this
 * serve" is a question worth putting. Counting every admin task would turn a real signal into
 * noise about errands.
 */
export async function loadUnanchoredDrift(
  client: TypedSupabaseClient,
  userId: string,
  window: { from: LocalDate; to: LocalDate },
): Promise<DataResult<UnanchoredReport>> {
  const { data, error } = await client
    .from('tasks')
    .select('id, title, planned_date, mom_id')
    .eq('user_id', userId)
    .not('mit_rank', 'is', null)
    .gte('planned_date', window.from)
    .lte('planned_date', window.to);
  if (error) return dataErr(mapDataError(error));

  const source = await loadChainSource(client, userId);
  if (!source.ok) return source;

  const items: WindowItem[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    date: row.planned_date,
    momId: row.mom_id,
  }));

  return dataOk(unanchoredOverWindow(items, source.data, window.from, window.to));
}

/**
 * Every chain node the resolver may need, in one read.
 *
 * Retired rows come back too. A goal anchored to last quarter's M.O.M. still resolves through it,
 * because it genuinely served that quarter — dropping inactive rows would silently reclassify
 * finished work as drift.
 */
async function loadChainSource(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<ChainSource>> {
  const [visionResult, beachheads, missions, moms] = await Promise.all([
    getActiveVision(client, userId),
    client.from('beachheads').select('id, title, vision_id').eq('user_id', userId),
    client.from('missions').select('id, title, beachhead_id').eq('user_id', userId),
    client.from('moms').select('id, title, mission_id, starts_on, ends_on').eq('user_id', userId),
  ]);
  if (!visionResult.ok) return visionResult;
  if (beachheads.error) return dataErr(mapDataError(beachheads.error));
  if (missions.error) return dataErr(mapDataError(missions.error));
  if (moms.error) return dataErr(mapDataError(moms.error));

  return dataOk({
    vision:
      visionResult.data == null
        ? null
        : { id: visionResult.data.id, headline: firstLine(visionResult.data.body) },
    beachheads: (beachheads.data ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      visionId: b.vision_id,
    })),
    missions: (missions.data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      beachheadId: m.beachhead_id,
    })),
    moms: (moms.data ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      missionId: m.mission_id,
      startsOn: m.starts_on,
      endsOn: m.ends_on,
    })),
  });
}

/** The vision's first line, for the places that show the chain as one row of links. */
function firstLine(body: string): string {
  const line = body.split('\n').find((l) => l.trim().length > 0);
  return (line ?? body).trim();
}

// ============================================================================
// The 90-day review ritual
// ============================================================================

export interface SaveMomReviewInput {
  momId: number;
  localDate: LocalDate;
  outcome: MomOutcome;
  whatHappened?: string | null;
  /**
   * The next 90 days, when the user is ready to name them. Null or absent closes this M.O.M.
   * without setting one — "I need to think about this" is an honest way to finish a review, and
   * forcing a next M.O.M. to close the last one would manufacture a plan to satisfy a form.
   */
  next?: { title: string; target?: string | null; startsOn?: LocalDate | null; endsOn?: LocalDate | null } | null;
}

export interface SaveMomReviewResult {
  review: MomReviewRow;
  nextMom: MomRow | null;
}

/**
 * Closes a M.O.M.: score it, write what happened, and set the next one if there is one.
 *
 * Order matters and is not incidental. The finished M.O.M. is deactivated *before* the next is
 * created, because one active M.O.M. per user is a partial unique index rather than a convention
 * — creating first would be rejected by the database, which is the outcome we want from a wrong
 * order rather than two live M.O.M.s.
 *
 * The new M.O.M. inherits the finished one's mission. That is not the app choosing a direction:
 * the mission is the layer above and did not end when the quarter did. `changed` says the
 * *M.O.M.* was the wrong 90 days; re-pointing the mission is its own edit on the chain surface.
 */
export async function saveMomReview(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveMomReviewInput,
): Promise<DataResult<SaveMomReviewResult>> {
  const { data: mom, error: momError } = await client
    .from('moms')
    .select('*')
    .eq('id', input.momId)
    .eq('user_id', userId)
    .maybeSingle();
  if (momError) return dataErr(mapDataError(momError));
  if (mom == null) return dataErr({ code: 'not_found', message: "That M.O.M. doesn't exist." });

  const { error: closeError } = await client
    .from('moms')
    .update({ active: false })
    .eq('id', mom.id)
    .eq('user_id', userId);
  if (closeError) return dataErr(mapDataError(closeError));

  let nextMom: MomRow | null = null;
  if (input.next != null) {
    const created = await saveMom(client, userId, {
      title: input.next.title,
      ...(input.next.target !== undefined ? { target: input.next.target } : {}),
      ...(input.next.startsOn !== undefined ? { startsOn: input.next.startsOn } : {}),
      ...(input.next.endsOn !== undefined ? { endsOn: input.next.endsOn } : {}),
      parentId: mom.mission_id,
    });
    // The M.O.M. is already closed at this point. Reported rather than rolled back, with the
    // state named: PostgREST has no transaction across calls, and a silent "saved" over a
    // half-finished ritual is the failure mode worth avoiding.
    if (!created.ok) {
      return dataErr({
        code: created.error.code,
        message: `Closed the M.O.M., but couldn't set the next one: ${created.error.message}`,
      });
    }
    nextMom = created.data;
  }

  const whatHappened =
    input.whatHappened == null || input.whatHappened.trim() === '' ? null : input.whatHappened.trim();

  const { data: review, error: reviewError } = await client
    .from('mom_reviews')
    .upsert(
      {
        user_id: userId,
        mom_id: mom.id,
        local_date: input.localDate,
        outcome: input.outcome,
        what_happened: whatHappened,
        next_mom_id: nextMom?.id ?? null,
      },
      { onConflict: 'user_id,mom_id' },
    )
    .select('*')
    .single();
  if (reviewError) return dataErr(mapDataError(reviewError));

  return dataOk({ review, nextMom });
}

// ============================================================================
// The assembled read
// ============================================================================

export interface ChainGoal {
  goal: GoalRow;
  /** Whether this goal reaches a M.O.M. at all. Not a judgement — a fact the surface can act on. */
  anchored: boolean;
}

export interface MomHistoryEntry {
  mom: MomRow;
  /** Null when a M.O.M. was closed without a review being written. That happens; it is not a gap
   *  to fill in with an assumed outcome. */
  review: MomReviewRow | null;
}

export interface VisionChainView {
  today: LocalDate;
  vision: VisionRow | null;
  /** The active layers, each null until the user writes one. Nothing is seeded. */
  beachhead: BeachheadRow | null;
  mission: MissionRow | null;
  mom: MomRow | null;
  /** Null when there is no active M.O.M., and `daysRemaining` null when it has no end date. */
  countdown: MomCountdown | null;
  /** The first layer the line breaks at, walking up from the M.O.M. Null when it is unbroken. */
  firstMissing: ChainLayer | null;
  reviewDue: boolean;
  /** The review already written for the active M.O.M., if any. */
  activeMomReview: MomReviewRow | null;
  goals: ChainGoal[];
  /** How many active goals reach no M.O.M. A count, stated beside the goals themselves. */
  unanchoredGoals: number;
  drift: UnanchoredReport;
  /** The one sentence, composed in core so both platforms word it identically. */
  driftLine: string | null;
  history: MomHistoryEntry[];
}

/**
 * Everything `/vision` renders, in one call.
 *
 * Assembled here rather than in either shell so the two platforms cannot show different chains,
 * and so no surface has to know that "the active M.O.M." is a partial unique index rather than a
 * sort. Every layer comes back nullable: the honest first-run state is four empty invitations.
 */
export async function loadVisionChain(
  client: TypedSupabaseClient,
  userId: string,
  input: { today: LocalDate; driftFrom?: LocalDate },
): Promise<DataResult<VisionChainView>> {
  const driftFrom = input.driftFrom ?? addDays(input.today, -DEFAULT_DRIFT_WINDOW_DAYS + 1);

  const [visionResult, beachheadQuery, missionQuery, momQuery, goalQuery] = await Promise.all([
    getActiveVision(client, userId),
    client.from('beachheads').select('*').eq('user_id', userId).eq('active', true).maybeSingle(),
    client.from('missions').select('*').eq('user_id', userId).eq('active', true).maybeSingle(),
    client.from('moms').select('*').eq('user_id', userId).eq('active', true).maybeSingle(),
    client
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('position', { ascending: true }),
  ]);
  if (!visionResult.ok) return visionResult;
  if (beachheadQuery.error) return dataErr(mapDataError(beachheadQuery.error));
  if (missionQuery.error) return dataErr(mapDataError(missionQuery.error));
  if (momQuery.error) return dataErr(mapDataError(momQuery.error));
  if (goalQuery.error) return dataErr(mapDataError(goalQuery.error));

  const vision = visionResult.data;
  const beachhead = beachheadQuery.data;
  const mission = missionQuery.data;
  const mom = momQuery.data;

  // The active line, resolved through core rather than assumed. The four active rows are not
  // automatically a chain: an active mission with no beachhead_id is a real and common state
  // while someone is still filling the layers in, and it must read as a gap, not a link.
  const activeSource: ChainSource = {
    vision: vision == null ? null : { id: vision.id, headline: firstLine(vision.body) },
    beachheads:
      beachhead == null ? [] : [{ id: beachhead.id, title: beachhead.title, visionId: beachhead.vision_id }],
    missions:
      mission == null ? [] : [{ id: mission.id, title: mission.title, beachheadId: mission.beachhead_id }],
    moms:
      mom == null
        ? []
        : [
            {
              id: mom.id,
              title: mom.title,
              missionId: mom.mission_id,
              startsOn: mom.starts_on,
              endsOn: mom.ends_on,
            },
          ],
  };
  const resolved = resolveChain(activeSource, { momId: mom?.id ?? null });

  const [fullSource, driftResult, reviewsResult, historyResult] = await Promise.all([
    loadChainSource(client, userId),
    loadUnanchoredDrift(client, userId, { from: driftFrom, to: input.today }),
    client.from('mom_reviews').select('*').eq('user_id', userId).order('local_date', { ascending: false }),
    client
      .from('moms')
      .select('*')
      .eq('user_id', userId)
      .eq('active', false)
      .order('ends_on', { ascending: false, nullsFirst: false }),
  ]);
  if (!fullSource.ok) return fullSource;
  if (!driftResult.ok) return driftResult;
  if (reviewsResult.error) return dataErr(mapDataError(reviewsResult.error));
  if (historyResult.error) return dataErr(mapDataError(historyResult.error));

  const reviewByMom = new Map((reviewsResult.data ?? []).map((r) => [r.mom_id, r]));
  const activeMomReview = mom == null ? null : (reviewByMom.get(mom.id) ?? null);

  const momNode = activeSource.moms[0] ?? null;

  return dataOk({
    today: input.today,
    vision,
    beachhead,
    mission,
    mom,
    countdown: momNode == null ? null : momCountdown(momNode, input.today),
    firstMissing: resolved.firstMissing,
    reviewDue: isMomReviewDue(momNode, input.today, activeMomReview != null),
    activeMomReview,
    // Resolved through core rather than read off `mom_id`, so "anchored" means the same thing for
    // a goal as it does for an MIT — including the case where a goal points at a M.O.M. that is no
    // longer in the active line.
    goals: (goalQuery.data ?? []).map((goal) => ({
      goal,
      anchored: resolveChain(fullSource.data, { momId: goal.mom_id }).anchored,
    })),
    unanchoredGoals: unanchoredCount(
      (goalQuery.data ?? []).map((goal) => ({
        id: goal.id,
        title: goal.title,
        date: input.today,
        momId: goal.mom_id,
      })),
      fullSource.data,
    ),
    drift: driftResult.data,
    driftLine: composeDriftLine(driftResult.data),
    history: (historyResult.data ?? []).map((m) => ({ mom: m, review: reviewByMom.get(m.id) ?? null })),
  });
}
