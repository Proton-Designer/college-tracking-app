import type { LifeDomain, LocalDate } from '@collegeos/core';
import { countsTowardHours, startOfWeek } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { getUserLocalToday } from '../day/today';
import { monthOf, type GoalRow, type MilestoneRow } from './goals';
import type { Task } from './tasks';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

/**
 * The weekly-goal cadence (D37), and the Business lens that reads it.
 *
 * **Why these two live in one file.** `weekly_goals` is the cadence layer — one headline per
 * domain per week — and Business is a *lens*, not a store (directive rule 3.4): it owns no
 * table of its own, and `weekly_goals` is the only new table it reads. Giving Business a data
 * module would create a file named after a domain that has no data, which is exactly the
 * impression the directive is trying to avoid.
 *
 * **D37 is the load-bearing ruling here, twice over.**
 *
 * 1. *There is no second "today's three".* The kill list and the MIT system are the same idea
 *    at the same cardinality, and ours is DB-enforced (`tasks.mit_rank` 1–3, partial unique
 *    per day). `loadBusinessLens` reads `tasks.mit_rank`. It must never grow its own list.
 *
 * 2. *War Map and the weekly headline both survive, linked.* `goals`/`milestones` is the store
 *    of direction; `weekly_goals` is the cadence. `weekly_goals.goal_id` is the link and is
 *    nullable on purpose, so the lens below resolves it when present and says nothing when
 *    absent rather than pressing the user to invent a lineage for an urgent week.
 *
 * **How a task is "business-tagged."** `tasks` carries `category` (free text, migration 5) and
 * has no domain column — the `life_domain` enum lives on `task_sessions`, not on `tasks`. So
 * the tag is the category string, matched case-insensitively against
 * `BUSINESS_TASK_CATEGORY`. This is stated on screen too: the empty state names the exact word
 * to type, because a lens whose membership rule is invisible looks broken rather than empty.
 */

export type WeeklyGoalRow = Database['public']['Tables']['weekly_goals']['Row'];

/**
 * The `tasks.category` value that puts a task in the Business lens.
 *
 * A constant rather than a scattered literal so the query, the empty-state copy and any
 * future task-creation default cannot drift apart. If `tasks` ever gains a real `domain`
 * column this is the single place that changes.
 */
export const BUSINESS_TASK_CATEGORY = 'business';

// ---------------------------------------------------------------------------
// Weekly goals
// ---------------------------------------------------------------------------

/** Every domain's headline for one week. Used by the Life hub and by each domain page. */
export async function listWeeklyGoals(
  client: TypedSupabaseClient,
  userId: string,
  weekStart: LocalDate,
): Promise<DataResult<WeeklyGoalRow[]>> {
  const { data, error } = await client
    .from('weekly_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start_date', weekStart);
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export interface UpsertWeeklyGoalInput {
  weekStart: LocalDate;
  domain: LifeDomain;
  headline: string;
  /** One milestone per line, exactly as LifeOS models it — written and rewritten as a block
   *  in one textarea, never queried individually. */
  milestones?: string | null;
  /** The War Map milestone's goal this week steps down from. Null is a real answer. */
  goalId?: number | null;
}

/**
 * Writes the week's headline for one domain.
 *
 * An upsert on `weekly_goals_one_per_domain_week`, because more than one headline per domain
 * per week is not a focus — rewriting the week edits the week rather than stacking a second
 * intention beside the first.
 */
export async function upsertWeeklyGoal(
  client: TypedSupabaseClient,
  userId: string,
  input: UpsertWeeklyGoalInput,
): Promise<DataResult<WeeklyGoalRow>> {
  const headline = input.headline.trim();
  if (headline.length === 0) {
    return dataErr({ code: 'validation', message: 'A week needs a headline — one sentence is enough.' });
  }

  const milestones = input.milestones?.trim() ?? '';
  const { data, error } = await client
    .from('weekly_goals')
    .upsert(
      {
        user_id: userId,
        week_start_date: input.weekStart,
        domain: input.domain,
        headline,
        milestones: milestones.length > 0 ? milestones : null,
        goal_id: input.goalId ?? null,
      },
      { onConflict: 'user_id,week_start_date,domain' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Closes a week's focus, or reopens it.
 *
 * D37 puts this in the Sunday review; the domain page carries the same one-tap control so a
 * week can be closed the moment it is actually finished rather than held until Sunday.
 */
export async function setWeeklyGoalCompleted(
  client: TypedSupabaseClient,
  userId: string,
  weeklyGoalId: number,
  completed: boolean,
): Promise<DataResult<WeeklyGoalRow>> {
  const { data, error } = await client
    .from('weekly_goals')
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq('id', weeklyGoalId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That weekly goal could not be found.' });
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// The Business lens
// ---------------------------------------------------------------------------

export interface BusinessHoursToday {
  /** Completed sessions today tagged `business` that count toward Hours (D28's deep types). */
  hours: number;
  /** Their total logged minutes. Null when no completed deep business session recorded a
   *  duration — "nobody wrote down how long" is not "zero minutes" (D40). */
  minutes: number | null;
  /** Business sessions today that are real sessions but not Hours — a Learn or anti-worry
   *  session. Counted separately so the headline number keeps meaning what D28 says it means. */
  otherSessions: number;
}

export interface BusinessLens {
  today: LocalDate;
  timezone: string;
  weekStart: LocalDate;
  /** Today's MITs that are business-tagged, in rank order. D37: this reads `tasks.mit_rank`.
   *  There is no second "today's three" anywhere in this file. */
  mits: Task[];
  /** How many MITs the day has in total, across every domain. Lets the page say "your three
   *  MITs today are elsewhere" instead of implying none were chosen. */
  mitsTodayTotal: number;
  /** Business-tagged tasks that are neither completed nor cancelled, soonest first. */
  openTasks: Task[];
  /** This week's business headline, or null when none has been written. */
  weeklyGoal: WeeklyGoalRow | null;
  /** The War Map goal `weeklyGoal.goal_id` points at, and that goal's milestone for the
   *  current month. Both null when the week is not linked to one — a legitimate answer. */
  linkedGoal: GoalRow | null;
  linkedMilestone: MilestoneRow | null;
  /** Active War Map goals, for the picker that sets `weekly_goals.goal_id`. Separate from
   *  `linkedGoal` because a week can legitimately point at a goal that has since been
   *  retired, and dropping that link on read would rewrite history to tidy a dropdown. */
  warMapGoals: GoalRow[];
  hoursToday: BusinessHoursToday;
}

/**
 * Everything the Business page renders, in one call.
 *
 * It is a lens over primitives three other features already own: `tasks` (MITs and open
 * work), `weekly_goals` (the week's focus), `goals`/`milestones` (the direction it steps down
 * from), and `task_sessions` (the Hours). Nothing here writes, and nothing here stores.
 *
 * The Hours count runs through `countsTowardHours` rather than a local predicate. D28's rule
 * that a Learn session is a real session but not an Hour lives in exactly one place in this
 * codebase, and a lens re-deriving it would be the second.
 */
export async function loadBusinessLens(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<BusinessLens>> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  const timezone = profile.timezone;
  const today = getUserLocalToday(timezone, now);
  const weekStart = startOfWeek(today);

  const [todayTasksResult, openTasksResult, weeklyResult, sessionsResult, goalsResult] = await Promise.all([
    client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('planned_date', today)
      .not('mit_rank', 'is', null)
      .order('mit_rank', { ascending: true }),
    client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .ilike('category', BUSINESS_TASK_CATEGORY)
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .order('planned_date', { ascending: true }),
    listWeeklyGoals(client, userId, weekStart),
    client
      .from('task_sessions')
      .select('session_type, status, actual_duration_min')
      .eq('user_id', userId)
      .eq('domain', 'business')
      .eq('local_date', today),
    client
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('position', { ascending: true }),
  ]);
  if (todayTasksResult.error) return dataErr(mapDataError(todayTasksResult.error));
  if (openTasksResult.error) return dataErr(mapDataError(openTasksResult.error));
  if (!weeklyResult.ok) return weeklyResult;
  if (sessionsResult.error) return dataErr(mapDataError(sessionsResult.error));
  if (goalsResult.error) return dataErr(mapDataError(goalsResult.error));

  const mitsToday = todayTasksResult.data ?? [];
  const businessMits = mitsToday.filter((t) => t.category.trim().toLowerCase() === BUSINESS_TASK_CATEGORY);

  const weeklyGoal = weeklyResult.data.find((row) => row.domain === 'business') ?? null;

  let linkedGoal: GoalRow | null = null;
  let linkedMilestone: MilestoneRow | null = null;
  if (weeklyGoal?.goal_id != null) {
    const { data: goal, error: goalError } = await client
      .from('goals')
      .select('*')
      .eq('id', weeklyGoal.goal_id)
      .eq('user_id', userId)
      .maybeSingle();
    if (goalError) return dataErr(mapDataError(goalError));
    linkedGoal = goal ?? null;

    if (linkedGoal != null) {
      const { data: milestone, error: milestoneError } = await client
        .from('milestones')
        .select('*')
        .eq('user_id', userId)
        .eq('goal_id', linkedGoal.id)
        .eq('month', monthOf(today))
        .maybeSingle();
      if (milestoneError) return dataErr(mapDataError(milestoneError));
      linkedMilestone = milestone ?? null;
    }
  }

  const sessions = sessionsResult.data ?? [];
  const completedDeep = sessions.filter((s) => s.status === 'completed' && countsTowardHours(s.session_type));
  const durations = completedDeep
    .map((s) => s.actual_duration_min)
    .filter((m): m is number => m != null);

  return dataOk({
    today,
    timezone,
    weekStart,
    mits: businessMits,
    mitsTodayTotal: mitsToday.length,
    openTasks: openTasksResult.data ?? [],
    weeklyGoal,
    linkedGoal,
    linkedMilestone,
    warMapGoals: goalsResult.data ?? [],
    hoursToday: {
      hours: completedDeep.length,
      minutes: durations.length === 0 ? null : durations.reduce((a, b) => a + b, 0),
      otherSessions: sessions.filter((s) => s.status === 'completed' && !countsTowardHours(s.session_type)).length,
    },
  });
}
