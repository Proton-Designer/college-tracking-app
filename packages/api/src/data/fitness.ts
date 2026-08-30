import type { LocalDate } from '@collegeos/core';
import {
  addDays,
  cycleProgress,
  startOfWeek,
  volumeByMuscle,
  weekStrip,
  type Cycle,
  type CycleProgress,
  type MuscleGroup,
  type WeekDay,
  cycleForDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { getUserLocalToday } from '../day/today';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

/**
 * The Fitness domain's data layer. Fetch-and-write only, in the shape `deen.ts` established:
 * **nothing in this file computes a fitness number.** The 4-week cycle, the Sun–Sat strip,
 * the per-muscle volume credit and the body-composition deltas are all
 * `packages/core/src/fitness/fitness.ts`, called from `loadFitnessOverview` below and never
 * re-derived here or in a UI (Law 2 / the `check:core-mirror` reasoning applied to a read).
 *
 * Three properties of migration 52 shape everything in here:
 *
 * 1. **Plan vs performed are different tables.** `plan_sessions` is what you intend to do,
 *    `workout_sessions` is what happened. A missed workout has to stay distinguishable from
 *    one that was never scheduled, so no write in this file ever collapses the two.
 *
 * 2. **A workout session is a draft until `confirmed_at` is set.** That is precisely what
 *    makes "confirmed sets this week" a real number rather than a count of half-entered
 *    rows, so the week strip and the volume read below both filter on it — and both say so
 *    on screen rather than quietly showing a smaller number than the user just typed.
 *
 * 3. **An exercise is retired, never deleted** (`active = false`). A logged set pointing at
 *    a vanished exercise would corrupt every historical volume number.
 *
 * D40 lives at the read boundary and is the DEFAULT state for all three users: nothing is
 * seeded. No cycle anchor means `cycle` is `null` — not "cycle 1, day 1" computed from an
 * invented anchor. No exercises means an empty library, no active plan means `activePlan` is
 * `null`, and one measurement in a cycle means `cycleProgress` returns a `null` delta. This
 * module passes every one of those through untouched, and a caller must never render a `0`
 * where it handed back a `null`.
 */

export type ExerciseRow = Database['public']['Tables']['exercises']['Row'];
export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row'];
export type PlanSessionRow = Database['public']['Tables']['plan_sessions']['Row'];
export type PlanSessionExerciseRow = Database['public']['Tables']['plan_session_exercises']['Row'];
export type WorkoutSessionRow = Database['public']['Tables']['workout_sessions']['Row'];
export type SessionSetRow = Database['public']['Tables']['session_sets']['Row'];
export type BodyMetricRow = Database['public']['Tables']['body_metrics']['Row'];

/** The `muscle_group` enum. Identical by construction to `packages/core`'s `MuscleGroup`
 *  union — migration 52's enum and that union mirror each other, and `volumeByMuscle` is
 *  typed against the core one, so the two are used interchangeably below on purpose. */
export type MuscleGroupValue = Database['public']['Enums']['muscle_group'];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The movement library. Retired exercises come back too (they are needed to label historical
 * sets and to offer "bring it back"), tagged by their own `active` column rather than
 * filtered out here — a caller that drops them would make an old set render as "unknown
 * exercise".
 */
export async function listExercises(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<ExerciseRow[]>> {
  const { data, error } = await client
    .from('exercises')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** Every workout session in a date range, newest first. */
export async function listWorkoutSessionsInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<WorkoutSessionRow[]>> {
  const { data, error } = await client
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** Body measurements in a range, oldest first — the order `cycleProgress` reads them in. */
export async function listBodyMetricsInRange(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<BodyMetricRow[]>> {
  const { data, error } = await client
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

// ---------------------------------------------------------------------------
// Writes -- the exercise library
// ---------------------------------------------------------------------------

export interface CreateExerciseInput {
  name: string;
  primaryMuscles: MuscleGroupValue[];
  secondaryMuscles?: MuscleGroupValue[];
  notes?: string | null;
}

/**
 * Adds a movement to the library.
 *
 * A primary mover is required even though the column defaults to `{}`: an exercise with no
 * primary muscle contributes nothing to `volumeByMuscle` forever, so the set would be logged
 * and then silently vanish from every volume read. Better to refuse in one sentence than to
 * accept a row that quietly cannot count.
 */
export async function createExercise(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateExerciseInput,
): Promise<DataResult<ExerciseRow>> {
  const name = input.name.trim();
  if (name.length === 0) {
    return dataErr({ code: 'validation', message: 'An exercise needs a name.' });
  }
  if (input.primaryMuscles.length === 0) {
    return dataErr({
      code: 'validation',
      message: 'Pick at least one primary muscle — without one, sets of this movement can never count toward volume.',
    });
  }

  const notes = input.notes?.trim() ?? '';
  const { data, error } = await client
    .from('exercises')
    .insert({
      user_id: userId,
      name,
      primary_muscles: input.primaryMuscles,
      // A muscle listed as both primary and secondary is dropped from the secondary list
      // here, matching `volumeByMuscle`'s ruling that the primary classification wins. The
      // engine already ignores the duplicate; storing it would leave a row whose displayed
      // tags disagree with the number computed from them.
      secondary_muscles: (input.secondaryMuscles ?? []).filter((m) => !input.primaryMuscles.includes(m)),
      notes: notes.length > 0 ? notes : null,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Retires a movement, or brings it back. Never a delete: `session_sets.exercise_id` is
 * `on delete restrict` precisely so that history cannot be orphaned, and a retired exercise
 * keeps labelling every set that was ever logged against it.
 */
export async function setExerciseActive(
  client: TypedSupabaseClient,
  userId: string,
  exerciseId: number,
  active: boolean,
): Promise<DataResult<ExerciseRow>> {
  const { data, error } = await client
    .from('exercises')
    .update({ active })
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That exercise could not be found.' });
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// Writes -- plans
// ---------------------------------------------------------------------------

export interface CreateWorkoutPlanInput {
  name: string;
  description?: string | null;
  /** Whether this becomes the active plan. Defaults to true: someone writing their first
   *  plan means to train on it, and the alternative is a plan list where nothing is active. */
  activate?: boolean;
}

/**
 * Creates a plan and, by default, makes it the active one.
 *
 * `workout_plans_one_active_per_user` is a partial unique index, so activating has to
 * deactivate first — two statements, in that order, because the reverse order is the one
 * that trips the index. This is not atomic and does not need to be: the failure mode is a
 * user with no active plan for a few milliseconds, which reads as "no active plan" and is
 * recoverable by tapping again. (D19's wrapper rules are for the cases where it is not.)
 */
export async function createWorkoutPlan(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateWorkoutPlanInput,
): Promise<DataResult<WorkoutPlanRow>> {
  const name = input.name.trim();
  if (name.length === 0) return dataErr({ code: 'validation', message: 'A plan needs a name.' });

  const activate = input.activate ?? true;
  if (activate) {
    const { error: clearError } = await client
      .from('workout_plans')
      .update({ active: false })
      .eq('user_id', userId)
      .eq('active', true);
    if (clearError) return dataErr(mapDataError(clearError));
  }

  const description = input.description?.trim() ?? '';
  const { data, error } = await client
    .from('workout_plans')
    .insert({
      user_id: userId,
      name,
      description: description.length > 0 ? description : null,
      active: activate,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Switches which plan is active. Same deactivate-then-activate order as `createWorkoutPlan`. */
export async function activateWorkoutPlan(
  client: TypedSupabaseClient,
  userId: string,
  planId: number,
): Promise<DataResult<WorkoutPlanRow>> {
  const { error: clearError } = await client
    .from('workout_plans')
    .update({ active: false })
    .eq('user_id', userId)
    .eq('active', true);
  if (clearError) return dataErr(mapDataError(clearError));

  const { data, error } = await client
    .from('workout_plans')
    .update({ active: true })
    .eq('id', planId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That plan could not be found.' });
  return dataOk(data);
}

export interface CreatePlanSessionInput {
  planId: number;
  name: string;
  /** ISO weekdays, 1 = Monday .. 7 = Sunday — the schema's single weekday convention. */
  scheduleDays?: number[];
}

export async function createPlanSession(
  client: TypedSupabaseClient,
  userId: string,
  input: CreatePlanSessionInput,
): Promise<DataResult<PlanSessionRow>> {
  const name = input.name.trim();
  if (name.length === 0) return dataErr({ code: 'validation', message: 'A session needs a name.' });

  const days = [...new Set(input.scheduleDays ?? [])].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
  const { data, error } = await client
    .from('plan_sessions')
    .insert({ user_id: userId, plan_id: input.planId, name, schedule_days: days })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface AddPlanSessionExerciseInput {
  planSessionId: number;
  exerciseId: number;
  targetSets?: number | null;
  targetRepsLow?: number | null;
  targetRepsHigh?: number | null;
  targetLoad?: number | null;
}

/**
 * Puts a movement into a planned session, with optional targets.
 *
 * Every target is nullable in the schema and stays nullable here: a plan that says "bench,
 * three sets" without prescribing a load is a real plan, and demanding a number would make
 * the user invent one. The rep-range check mirrors the DB constraint with a friendlier
 * message — the same division of labour `createQuestion` uses.
 */
export async function addPlanSessionExercise(
  client: TypedSupabaseClient,
  userId: string,
  input: AddPlanSessionExerciseInput,
): Promise<DataResult<PlanSessionExerciseRow>> {
  const low = input.targetRepsLow ?? null;
  const high = input.targetRepsHigh ?? null;
  if (low != null && high != null && high < low) {
    return dataErr({ code: 'validation', message: 'The top of the rep range has to be at least its bottom.' });
  }

  const { data, error } = await client
    .from('plan_session_exercises')
    .insert({
      user_id: userId,
      plan_session_id: input.planSessionId,
      exercise_id: input.exerciseId,
      target_sets: input.targetSets ?? null,
      target_reps_low: low,
      target_reps_high: high,
      target_load: input.targetLoad ?? null,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// Writes -- what actually happened
// ---------------------------------------------------------------------------

export interface LogSetInput {
  localDate: LocalDate;
  exerciseId: number;
  reps?: number | null;
  load?: number | null;
  /** The planned session this is being performed under, when there is one. */
  planSessionId?: number | null;
}

/**
 * Logs one performed set, opening today's workout session if none is open yet.
 *
 * "Open" means unconfirmed: once a session is confirmed it is a finished statement about a
 * workout, and a later set starts a second session rather than editing a closed one. That
 * is also what makes a two-a-day representable without a UI for it.
 *
 * One row per set, never a sets-count column — per-set reps and load are the raw material of
 * every progression read, and the schema throws them away permanently if collapsed.
 */
export async function logSet(
  client: TypedSupabaseClient,
  userId: string,
  input: LogSetInput,
): Promise<DataResult<SessionSetRow>> {
  const reps = input.reps ?? null;
  const load = input.load ?? null;
  if (reps != null && (!Number.isInteger(reps) || reps < 0)) {
    return dataErr({ code: 'validation', message: 'Reps has to be a whole number, zero or more.' });
  }
  if (load != null && (!Number.isFinite(load) || load < 0)) {
    return dataErr({ code: 'validation', message: 'Load has to be zero or more.' });
  }

  const { data: open, error: openError } = await client
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .is('confirmed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openError) return dataErr(mapDataError(openError));

  let sessionId = open?.id ?? null;
  if (sessionId == null) {
    const { data: created, error: createError } = await client
      .from('workout_sessions')
      .insert({
        user_id: userId,
        local_date: input.localDate,
        plan_session_id: input.planSessionId ?? null,
      })
      .select('id')
      .single();
    if (createError) return dataErr(mapDataError(createError));
    sessionId = created.id;
  }

  // Appended at the end of the session by sort_order, so the order sets were performed in
  // survives a re-read. Counting the existing rows is enough here: `session_sets` has no
  // uniqueness on (session, sort_order), so a race produces two sets sharing a position,
  // not a failed write.
  const { count, error: countError } = await client
    .from('session_sets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('workout_session_id', sessionId);
  if (countError) return dataErr(mapDataError(countError));

  const { data, error } = await client
    .from('session_sets')
    .insert({
      user_id: userId,
      workout_session_id: sessionId,
      exercise_id: input.exerciseId,
      reps,
      load,
      sort_order: count ?? 0,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Removes a set. The undo for a mis-tap while a session is still being entered. */
export async function deleteSet(
  client: TypedSupabaseClient,
  userId: string,
  setId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client
    .from('session_sets')
    .delete()
    .eq('id', setId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That set could not be found.' });
  return dataOk(null);
}

/**
 * Confirms a workout session, or withdraws the confirmation.
 *
 * Confirming is what promotes a draft into the week strip and the volume totals. Withdrawing
 * is the undo, not an eraser: the sets stay exactly where they are, and the session goes back
 * to being open for more.
 */
export async function setWorkoutConfirmed(
  client: TypedSupabaseClient,
  userId: string,
  workoutSessionId: number,
  confirmed: boolean,
): Promise<DataResult<WorkoutSessionRow>> {
  const { data, error } = await client
    .from('workout_sessions')
    .update({ confirmed_at: confirmed ? new Date().toISOString() : null })
    .eq('id', workoutSessionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That workout could not be found.' });
  return dataOk(data);
}

export interface LogBodyMetricsInput {
  localDate: LocalDate;
  weightLb?: number | null;
  waistIn?: number | null;
}

/**
 * One measurement per day, upserted on `body_metrics_one_per_day` — re-weighing yourself
 * corrects the day's row rather than adding a second opinion about the same morning.
 *
 * At least one of the two is required, mirroring `body_metrics_records_something` with a
 * friendlier message. Units are lb / in because the column names say so (migration 52 keeps
 * LifeOS's units deliberately); nothing here converts.
 */
export async function logBodyMetrics(
  client: TypedSupabaseClient,
  userId: string,
  input: LogBodyMetricsInput,
): Promise<DataResult<BodyMetricRow>> {
  const weight = input.weightLb ?? null;
  const waist = input.waistIn ?? null;
  if (weight == null && waist == null) {
    return dataErr({ code: 'validation', message: 'Record a weight, a waist measurement, or both.' });
  }
  if (weight != null && (!Number.isFinite(weight) || weight <= 0)) {
    return dataErr({ code: 'validation', message: 'Weight has to be a number greater than zero.' });
  }
  if (waist != null && (!Number.isFinite(waist) || waist <= 0)) {
    return dataErr({ code: 'validation', message: 'Waist has to be a number greater than zero.' });
  }

  const { data, error } = await client
    .from('body_metrics')
    .upsert(
      { user_id: userId, local_date: input.localDate, weight_lb: weight, waist_in: waist },
      { onConflict: 'user_id,local_date' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Sets (or moves) the 4-week cycle anchor. One row per user, so this is an upsert on the
 * primary key.
 *
 * Until it exists there is no cycle at all — `loadFitnessOverview` returns `cycle: null`
 * rather than inventing an anchor, because a cycle counted from a date the user never chose
 * is a fabricated number wearing a header (D40).
 */
export async function setCycleAnchor(
  client: TypedSupabaseClient,
  userId: string,
  anchorDate: LocalDate,
): Promise<DataResult<Database['public']['Tables']['fitness_cycle_anchor']['Row']>> {
  const { data, error } = await client
    .from('fitness_cycle_anchor')
    .upsert({ user_id: userId, anchor_date: anchorDate }, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// The assembled read
// ---------------------------------------------------------------------------

export interface PlanSessionWithExercises {
  session: PlanSessionRow;
  exercises: { planned: PlanSessionExerciseRow; exercise: ExerciseRow | null }[];
}

export interface LoggedSet {
  set: SessionSetRow;
  /** Null only if the movement was somehow removed — retirement keeps it resolvable. */
  exercise: ExerciseRow | null;
}

export interface TodayWorkout {
  session: WorkoutSessionRow;
  sets: LoggedSet[];
}

export interface FitnessOverview {
  today: LocalDate;
  timezone: string;
  /** Sunday of this week — `startOfWeek`, which is what the Sun–Sat strip is drawn against. */
  weekStart: LocalDate;
  /** Null until the user sets an anchor. Never a cycle computed from an invented date. */
  cycle: Cycle | null;
  anchorDate: LocalDate | null;
  activePlan: WorkoutPlanRow | null;
  /** Empty when there is no active plan, or when the active plan has no sessions yet. */
  planSessions: PlanSessionWithExercises[];
  /** Every plan, so the page can offer a switch once there is more than one. */
  plans: WorkoutPlanRow[];
  activeExercises: ExerciseRow[];
  retiredExercises: ExerciseRow[];
  /** Today's workouts, newest first. Usually zero or one; two-a-days are representable. */
  todayWorkouts: TodayWorkout[];
  /** Sun..Sat. A future day carries `confirmedSets: null` — a caller must render that blank,
   *  never `0`, because a zero on Thursday when it is Tuesday claims Thursday was a rest day. */
  week: WeekDay[];
  /** Confirmed sets only, this week, per muscle group. */
  weekVolume: Record<MuscleGroup, number>;
  /** How many confirmed sets the week's volume was computed from. Zero means "nothing
   *  confirmed yet" — which a caller must say, rather than presenting thirteen zeros as a
   *  measurement of a week that has not been measured. */
  weekConfirmedSetCount: number;
  /** Body composition across the current cycle. Null when there is no cycle to measure
   *  across. Inside it, a null delta means "one reading, nothing to compare" — never 0. */
  progress: CycleProgress | null;
  /** The most recent measurement of all time, cycle or not. Null when none was ever taken. */
  latestMeasurement: BodyMetricRow | null;
}

/**
 * Everything the Fitness page renders, in one call.
 *
 * Seven narrow reads, then `packages/core` does all of the deciding: `cycleForDate` for the
 * header, `weekStrip` for the Sun–Sat row, `volumeByMuscle` for the per-muscle credit and
 * `cycleProgress` for the deltas. Web and mobile both call this, which is what stops the two
 * platforms from disagreeing about how many sets a week contained.
 *
 * `now` is a parameter rather than an ambient clock read so a caller (and a test) fixes the
 * instant the local day is derived from; the whole page then describes one moment.
 */
export async function loadFitnessOverview(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<FitnessOverview>> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  const timezone = profile.timezone;
  const today = getUserLocalToday(timezone, now);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const [anchorResult, plansResult, exercisesResult, weekSessionsResult] = await Promise.all([
    client.from('fitness_cycle_anchor').select('anchor_date').eq('user_id', userId).maybeSingle(),
    client.from('workout_plans').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    listExercises(client, userId),
    // The week's sessions carry today's as well, since today is always inside [weekStart,
    // weekEnd] -- one read rather than two that could disagree about the same session.
    listWorkoutSessionsInRange(client, userId, weekStart, weekEnd),
  ]);
  if (anchorResult.error) return dataErr(mapDataError(anchorResult.error));
  if (plansResult.error) return dataErr(mapDataError(plansResult.error));
  if (!exercisesResult.ok) return exercisesResult;
  if (!weekSessionsResult.ok) return weekSessionsResult;

  const exercises = exercisesResult.data;
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const plans = plansResult.data ?? [];
  const activePlan = plans.find((p) => p.active) ?? null;

  const anchorDate = anchorResult.data?.anchor_date ?? null;
  const cycle = anchorDate == null ? null : cycleForDate(anchorDate, today);

  // Sets for the week, in one read keyed by the week's session ids. An empty week means no
  // ids to ask about, and PostgREST's `in.()` on an empty list is a needless round trip.
  const weekSessions = weekSessionsResult.data;
  const weekSessionIds = weekSessions.map((s) => s.id);
  let weekSets: SessionSetRow[] = [];
  if (weekSessionIds.length > 0) {
    const { data, error } = await client
      .from('session_sets')
      .select('*')
      .eq('user_id', userId)
      .in('workout_session_id', weekSessionIds)
      .order('sort_order', { ascending: true });
    if (error) return dataErr(mapDataError(error));
    weekSets = data ?? [];
  }

  const sessionById = new Map(weekSessions.map((s) => [s.id, s]));
  const confirmedSets = weekSets.filter((set) => sessionById.get(set.workout_session_id)?.confirmed_at != null);

  const confirmedSetsByDate: Record<LocalDate, number> = {};
  for (const set of confirmedSets) {
    const date = sessionById.get(set.workout_session_id)?.local_date;
    if (date == null) continue;
    confirmedSetsByDate[date] = (confirmedSetsByDate[date] ?? 0) + 1;
  }

  const setsBySession = new Map<number, SessionSetRow[]>();
  for (const set of weekSets) {
    const list = setsBySession.get(set.workout_session_id);
    if (list) list.push(set);
    else setsBySession.set(set.workout_session_id, [set]);
  }

  const todayWorkouts: TodayWorkout[] = weekSessions
    .filter((s) => s.local_date === today)
    .map((session) => ({
      session,
      sets: (setsBySession.get(session.id) ?? []).map((set) => ({
        set,
        exercise: exerciseById.get(set.exercise_id) ?? null,
      })),
    }));

  // Plan sessions and their prescribed movements, only for the active plan -- an inactive
  // plan's sessions are not on screen and reading them would be a wasted round trip.
  let planSessions: PlanSessionWithExercises[] = [];
  if (activePlan != null) {
    const { data: sessions, error: sessionsError } = await client
      .from('plan_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('plan_id', activePlan.id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (sessionsError) return dataErr(mapDataError(sessionsError));

    const sessionRows = sessions ?? [];
    let planned: PlanSessionExerciseRow[] = [];
    if (sessionRows.length > 0) {
      const { data: plannedRows, error: plannedError } = await client
        .from('plan_session_exercises')
        .select('*')
        .eq('user_id', userId)
        .in(
          'plan_session_id',
          sessionRows.map((s) => s.id),
        )
        .order('sort_order', { ascending: true });
      if (plannedError) return dataErr(mapDataError(plannedError));
      planned = plannedRows ?? [];
    }

    planSessions = sessionRows.map((session) => ({
      session,
      exercises: planned
        .filter((p) => p.plan_session_id === session.id)
        .map((p) => ({ planned: p, exercise: exerciseById.get(p.exercise_id) ?? null })),
    }));
  }

  // Measurements: the cycle's window for the deltas, plus the single most recent reading of
  // all time so a page with an empty cycle can still show what the last known number was
  // instead of an em-dash that reads as "never measured".
  let progress: CycleProgress | null = null;
  if (cycle != null) {
    const measurements = await listBodyMetricsInRange(client, userId, cycle.startDate, cycle.endDate);
    if (!measurements.ok) return measurements;
    progress = cycleProgress(
      measurements.data.map((row) => ({
        date: row.local_date as LocalDate,
        weightLb: row.weight_lb,
        waistIn: row.waist_in,
      })),
      cycle,
    );
  }

  const { data: latest, error: latestError } = await client
    .from('body_metrics')
    .select('*')
    .eq('user_id', userId)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return dataErr(mapDataError(latestError));

  return dataOk({
    today,
    timezone,
    weekStart,
    cycle,
    anchorDate: anchorDate as LocalDate | null,
    activePlan,
    planSessions,
    plans,
    activeExercises: exercises.filter((e) => e.active),
    retiredExercises: exercises.filter((e) => !e.active),
    todayWorkouts,
    week: weekStrip(weekStart, today, confirmedSetsByDate),
    weekVolume: volumeByMuscle(
      confirmedSets.map((set) => ({ exerciseId: set.exercise_id, reps: set.reps })),
      exercises.map((e) => ({
        id: e.id,
        primaryMuscles: e.primary_muscles,
        secondaryMuscles: e.secondary_muscles,
      })),
    ),
    weekConfirmedSetCount: confirmedSets.length,
    progress,
    latestMeasurement: latest ?? null,
  });
}
