import type { PostgrestError } from '@supabase/supabase-js';
import type { LocalDate } from '@collegeos/core';
import { addDays, isoWeekday, startOfWeek } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { getUserLocalToday } from '../day/today';
import { BUSINESS_TASK_CATEGORY } from './weeklyGoals';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

/**
 * The Life hub's read: one cheap fact set per domain, for the five cards.
 *
 * **Why this is not five `load*Overview` calls.** Each domain page's loader does seven or
 * eight reads because it renders a whole surface. The hub renders one line per domain, and
 * paying five full page loads for five sentences would make the hub the slowest screen in the
 * app while adding nothing a card can show.
 *
 * **Why it returns facts and not sentences.** Every field below is a count, a date or a
 * boolean. The status line is composed in the UI, on each platform, from these — a data module
 * that returned "3 targets moving" would be writing copy, and `packages/core`/`packages/api`
 * do not own copy.
 *
 * **D40 is why so many fields are nullable or paired with a boolean.** "No plan yet" and "a
 * plan with nothing logged" are different sentences, and a card that shows `0` for both is
 * telling one of them a lie about their week. Every domain here can distinguish "never set
 * up" from "set up and currently empty", and the cards say which.
 */

export interface DeenHubStatus {
  /** False for every user until a location is set — the default state, not an error (D40). */
  hasLocation: boolean;
  /** Prayers with a record today. A raw row count, deliberately not a derived status: the
   *  hub does not run the prayer engine, so it cannot and does not say anything about
   *  missed or on-time. That is `/deen`'s job. */
  loggedToday: number;
  totalPrayers: number;
}

export interface BusinessHubStatus {
  /** Business-tagged MITs today (`tasks.mit_rank`, D37 — there is no second today's-three). */
  mitsToday: number;
  openTasks: number;
  /** Whether a headline exists for this week's business row in `weekly_goals`. */
  hasWeeklyGoal: boolean;
}

export interface SchoolHubStatus {
  courses: number;
  /** Deliverables not yet complete and not yet past. */
  openDeliverables: number;
  /** The soonest of those. Null when nothing is open — never today's date as a stand-in. */
  nextDueDate: LocalDate | null;
}

export interface FitnessHubStatus {
  hasActivePlan: boolean;
  /** Confirmed workouts since Sunday. A draft session is not counted, for the same reason
   *  the week strip does not count it: it is not a finished statement about a workout. */
  confirmedWorkoutsThisWeek: number;
  /** True when something is part-entered today and not confirmed yet. */
  hasOpenWorkoutToday: boolean;
  exerciseCount: number;
}

export interface WorkHubStatus {
  activeTargets: number;
  blockedTargets: number;
  shiftsToday: number;
  /** False when no shift row of either shape exists — "no schedule entered" rather than
   *  "a schedule exists and today is clear". */
  hasAnyShift: boolean;
}

export interface LifeHub {
  today: LocalDate;
  timezone: string;
  weekStart: LocalDate;
  deen: DeenHubStatus;
  business: BusinessHubStatus;
  school: SchoolHubStatus;
  fitness: FitnessHubStatus;
  work: WorkHubStatus;
}

/** Count-only reads throughout: `head: true` asks PostgREST for the count and no rows, which
 *  is what keeps a five-domain hub to one round of small queries. */
async function countOf(
  query: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
): Promise<DataResult<number>> {
  const { count, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(count ?? 0);
}

export async function loadLifeHub(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<LifeHub>> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('timezone, location_lat, location_lng')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  const timezone = profile.timezone;
  const today = getUserLocalToday(timezone, now);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const todayWeekday = isoWeekday(today);

  const [
    prayersToday,
    businessMits,
    businessOpenTasks,
    weeklyGoals,
    courses,
    openDeliverables,
    activePlans,
    weekWorkouts,
    workTargets,
    shifts,
    exercises,
  ] = await Promise.all([
    countOf(
      client.from('prayers').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('local_date', today),
    ),
    countOf(
      client
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('planned_date', today)
        .not('mit_rank', 'is', null)
        .ilike('category', BUSINESS_TASK_CATEGORY),
    ),
    countOf(
      client
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .ilike('category', BUSINESS_TASK_CATEGORY)
        .neq('status', 'completed')
        .neq('status', 'cancelled'),
    ),
    client.from('weekly_goals').select('domain').eq('user_id', userId).eq('week_start_date', weekStart),
    countOf(
      client.from('courses').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('archived_at', null),
    ),
    client
      .from('deliverables')
      .select('local_due_date')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .gte('local_due_date', today)
      .order('local_due_date', { ascending: true }),
    client.from('workout_plans').select('id').eq('user_id', userId).eq('active', true).limit(1),
    client
      .from('workout_sessions')
      .select('local_date, confirmed_at')
      .eq('user_id', userId)
      .gte('local_date', weekStart)
      .lte('local_date', weekEnd),
    client.from('work_targets').select('status').eq('user_id', userId),
    client.from('work_shifts').select('weekday, local_date').eq('user_id', userId),
    countOf(
      client.from('exercises').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('active', true),
    ),
  ]);

  if (!prayersToday.ok) return prayersToday;
  if (!businessMits.ok) return businessMits;
  if (!businessOpenTasks.ok) return businessOpenTasks;
  if (weeklyGoals.error) return dataErr(mapDataError(weeklyGoals.error));
  if (!courses.ok) return courses;
  if (openDeliverables.error) return dataErr(mapDataError(openDeliverables.error));
  if (activePlans.error) return dataErr(mapDataError(activePlans.error));
  if (weekWorkouts.error) return dataErr(mapDataError(weekWorkouts.error));
  if (workTargets.error) return dataErr(mapDataError(workTargets.error));
  if (shifts.error) return dataErr(mapDataError(shifts.error));
  if (!exercises.ok) return exercises;

  const deliverableRows = openDeliverables.data ?? [];
  const workoutRows = weekWorkouts.data ?? [];
  const targetRows = workTargets.data ?? [];
  const shiftRows = shifts.data ?? [];

  return dataOk({
    today,
    timezone,
    weekStart,
    deen: {
      hasLocation: profile.location_lat != null && profile.location_lng != null,
      loggedToday: prayersToday.data,
      totalPrayers: 5,
    },
    business: {
      mitsToday: businessMits.data,
      openTasks: businessOpenTasks.data,
      hasWeeklyGoal: (weeklyGoals.data ?? []).some((row) => row.domain === 'business'),
    },
    school: {
      courses: courses.data,
      openDeliverables: deliverableRows.length,
      nextDueDate: (deliverableRows[0]?.local_due_date as LocalDate | undefined) ?? null,
    },
    fitness: {
      hasActivePlan: (activePlans.data ?? []).length > 0,
      confirmedWorkoutsThisWeek: workoutRows.filter((w) => w.confirmed_at != null).length,
      hasOpenWorkoutToday: workoutRows.some((w) => w.local_date === today && w.confirmed_at == null),
      exerciseCount: exercises.data,
    },
    work: {
      activeTargets: targetRows.filter((t) => t.status === 'active').length,
      blockedTargets: targetRows.filter((t) => t.status === 'blocked').length,
      shiftsToday: shiftRows.filter((s) => (s.local_date != null ? s.local_date === today : s.weekday === todayWeekday))
        .length,
      hasAnyShift: shiftRows.length > 0,
    },
  });
}
