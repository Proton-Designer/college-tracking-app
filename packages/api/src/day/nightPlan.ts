import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { createTask, type Task } from '../data/tasks';

/**
 * The Night Plan's write path -- BLUEPRINT Part III, ruling C3.
 *
 * C3 moved MIT-setting from the morning check-in to the night before, which makes this
 * the authoritative writer of `tasks.mit_rank`. The morning check-in survives as a
 * confirm-and-start step rather than being deleted.
 */

export interface NightPlanItem {
  title: string;
  /**
   * 1 = the crowned MIT, 2 and 3 = the other two starred items, null = dumped but not
   * starred. Mirrors `tasks.mit_rank`, whose partial unique index already enforces at most
   * one task per rank per day.
   */
  rank: 1 | 2 | 3 | null;
  /**
   * What this serves, when the user chose to say so — the optional "what does this serve?"
   * picker (D48). Null and absent both mean unanchored, and that is the default rather than a
   * lapse: forcing an answer here would make the plan unusable on the ordinary night when
   * something urgent is the honest one, and would train people to attach a lie.
   */
  momId?: number | null;
}

/**
 * Every Night Plan item becomes an ordinary task.
 *
 * `tasks.category` is NOT NULL and the Night Plan deliberately does not ask for one per
 * item -- the blueprint budgets two to three minutes for this whole ritual, and a category
 * picker on every dumped line is exactly the friction that makes a nightly habit stop
 * happening. So one default is applied to the batch and SHOWN in the UI rather than
 * invented silently. It is safe for the calibration engine because these tasks carry no
 * `estimated_minutes`: duration calibration trains on estimate-vs-actual pairs, and a task
 * with no estimate contributes no pair.
 */
export const NIGHT_PLAN_DEFAULT_CATEGORY = 'admin';

export interface SaveNightPlanResult {
  created: Task[];
}

/**
 * Writes tomorrow's plan.
 *
 * Existing ranks for that date are cleared first. The partial unique index would otherwise
 * reject a second task claiming rank 1, and more importantly the Night Plan is now the
 * authoritative source of the day's Top 3 (C3) -- a stale rank left over from another
 * surface would compete with it. Clearing sets `mit_rank` to null; it never deletes a
 * task, so nothing a user typed is lost by re-running the plan.
 *
 * Items are created through `createTask`, not a bespoke insert, so a planned task is
 * indistinguishable from one typed on Today and inherits the same RLS path.
 */
export async function saveNightPlan(
  client: TypedSupabaseClient,
  userId: string,
  plannedDate: LocalDate,
  items: NightPlanItem[],
  category: string = NIGHT_PLAN_DEFAULT_CATEGORY,
): Promise<DataResult<SaveNightPlanResult>> {
  const usable = items
    .map((item) => ({ ...item, title: item.title.trim() }))
    .filter((item) => item.title.length > 0);

  if (usable.length === 0) {
    return dataErr({ code: 'validation', message: 'Add at least one thing before closing the plan.' });
  }

  const ranks = usable.map((i) => i.rank).filter((r): r is 1 | 2 | 3 => r != null);
  if (new Set(ranks).size !== ranks.length) {
    return dataErr({ code: 'validation', message: 'Each of the three ranks can only be used once.' });
  }

  const { error: clearError } = await client
    .from('tasks')
    .update({ mit_rank: null })
    .eq('user_id', userId)
    .eq('planned_date', plannedDate)
    .not('mit_rank', 'is', null);
  if (clearError) return dataErr(mapDataError(clearError));

  const created: Task[] = [];
  for (const item of usable) {
    const result = await createTask(client, {
      user_id: userId,
      title: item.title,
      category,
      planned_date: plannedDate,
      ...(item.rank != null ? { mit_rank: item.rank } : {}),
      ...(item.momId != null ? { mom_id: item.momId } : {}),
    });
    // Stop at the first failure and report it with what did land, rather than silently
    // writing a partial plan the user believes is complete.
    if (!result.ok) {
      return dataErr({
        code: result.error.code,
        message: `Saved ${created.length} of ${usable.length} items, then failed: ${result.error.message}`,
      });
    }
    created.push(result.data);
  }

  return dataOk({ created });
}
