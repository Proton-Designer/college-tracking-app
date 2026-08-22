import {
  clampEscalationToOptIn,
  evaluateDeviationPrompt,
  evaluateEscalation,
  evaluateStaleTaskPrompt,
  evaluateUpcomingBlockNotification,
  frictionCauseForDeviationResponse,
  DEVIATION_PROMPT_ACTIONS,
  STALE_TASK_PROMPT_ACTIONS,
  type CommitmentLevel,
  type DeviationPromptAction,
  type LocalDate,
  type StaleTaskPromptAction,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { createIntervention, recordInterventionResponse, type InterventionRow } from '../data/interventions';
import { logFriction } from '../data/frictionLogs';
import { updateTaskStatus } from '../data/tasks';

/**
 * Exception-based notifications: scans today's timeboxed, not-yet-completed tasks for
 * any starting within the lead-time window and persists an intervention for each one
 * that qualifies. Idempotent per (task, kind, day) -- calling this repeatedly (e.g. a
 * periodic poll, since there's no push infrastructure to trigger it once) never
 * creates a second notification for the same upcoming block.
 */
export async function evaluateUpcomingBlockNotifications(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  now: Date,
): Promise<DataResult<InterventionRow[]>> {
  const [{ data: tasks, error: taskError }, { data: screenDaily, error: screenError }] = await Promise.all([
    client
      .from('tasks')
      .select('id, title, planned_start_at')
      .eq('user_id', userId)
      .eq('planned_date', today)
      .not('planned_start_at', 'is', null)
      .not('status', 'in', '(completed,cancelled)'),
    client.from('screen_daily').select('distracting_min').eq('user_id', userId).eq('local_date', today).maybeSingle(),
  ]);
  if (taskError) return dataErr(mapDataError(taskError));
  if (screenError) return dataErr(mapDataError(screenError));

  // Batched dedupe: one query for the whole day rather than one per task. Identical rule,
  // one round trip instead of N. /today was issuing 45 PostgREST round trips against 17 for
  // the next-heaviest screen (docs/L11_HARDENING.md) -- invisible locally at ~1ms each, but
  // 30-50ms each against cloud Supabase.
  const { data: firedRows, error: firedError } = await client
    .from('interventions')
    .select('related_task_id')
    .eq('user_id', userId)
    .eq('kind', 'exception_notification')
    .eq('local_date', today);
  if (firedError) return dataErr(mapDataError(firedError));
  const alreadyFired = new Set((firedRows ?? []).map((r) => r.related_task_id));

  const created: InterventionRow[] = [];
  for (const task of tasks ?? []) {
    if (alreadyFired.has(task.id)) continue;
    const decision = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date(task.planned_start_at!),
      taskTitle: task.title,
      screenTimeMinutesToday: screenDaily?.distracting_min ?? null,
    });
    if (!decision.shouldFire) continue;

    const result = await createIntervention(client, userId, {
      kind: 'exception_notification',
      // triggerReason is the EVIDENCE, message is what the user reads. They were the same
      // string, which made the UI render one sentence twice and -- worse -- meant the
      // record of *why* an intervention fired carried no measurement at all. The whole
      // claim of this product is that it argues from the record; an intervention that
      // can't show its working is asking for trust it hasn't earned.
      triggerReason: `Block begins in ${decision.minutesUntilStart} min`,
      message: decision.reason!,
      actions: ['Start', 'Move block'],
      relatedTaskId: task.id,
    });
    if (!result.ok) return result;
    created.push(result.data);
  }
  return dataOk(created);
}

/**
 * Deviation detection: for today's timeboxed tasks whose planned start has passed the
 * grace period with no focus session ever started, persists a one-tap deviation
 * prompt. Same per-(task, day) idempotency as the exception notifications above.
 */
export async function evaluateDeviationPrompts(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  now: Date,
): Promise<DataResult<InterventionRow[]>> {
  const { data: tasks, error: taskError } = await client
    .from('tasks')
    .select('id, title, planned_start_at')
    .eq('user_id', userId)
    .eq('planned_date', today)
    .not('planned_start_at', 'is', null)
    .not('status', 'in', '(completed,cancelled)');
  if (taskError) return dataErr(mapDataError(taskError));

  // Two batched reads replacing two per-task queries: which tasks already have a session,
  // and which already fired today. Same rules, two round trips instead of 2N.
  const taskIds = (tasks ?? []).map((t) => t.id);
  const startedTaskIds = new Set<number>();
  const alreadyFired = new Set<number | null>();
  if (taskIds.length > 0) {
    const [{ data: sessionRows, error: sessionError }, { data: firedRows, error: firedError }] = await Promise.all([
      client.from('task_sessions').select('task_id').in('task_id', taskIds),
      client
        .from('interventions')
        .select('related_task_id')
        .eq('user_id', userId)
        .eq('kind', 'deviation_prompt')
        .eq('local_date', today),
    ]);
    if (sessionError) return dataErr(mapDataError(sessionError));
    if (firedError) return dataErr(mapDataError(firedError));
    for (const row of sessionRows ?? []) if (row.task_id != null) startedTaskIds.add(row.task_id);
    for (const row of firedRows ?? []) alreadyFired.add(row.related_task_id);
  }

  const created: InterventionRow[] = [];
  for (const task of tasks ?? []) {
    if (alreadyFired.has(task.id)) continue;

    const decision = evaluateDeviationPrompt({
      now,
      plannedStartAt: new Date(task.planned_start_at!),
      taskTitle: task.title,
      sessionStarted: startedTaskIds.has(task.id),
    });
    if (!decision.shouldFire) continue;

    const result = await createIntervention(client, userId, {
      kind: 'deviation_prompt',
      triggerReason: `${decision.minutesLate} min past planned start, no session started`,
      message: decision.reason!,
      actions: [...DEVIATION_PROMPT_ACTIONS],
      relatedTaskId: task.id,
    });
    if (!result.ok) return result;
    created.push(result.data);
  }
  return dataOk(created);
}

/**
 * The one-tap response to a deviation prompt IS a friction log entry (per the brief:
 * "one tap generates useful behavioral data") -- this records the intervention's
 * outcome and, for the three real failure-reason buttons, logs the matching
 * friction_logs row in the same call. "Start now" is compliance, not a failure --
 * recorded as acted_on with no friction log, per frictionCauseForDeviationResponse's
 * own null case.
 */
export async function respondToDeviationPrompt(
  client: TypedSupabaseClient,
  userId: string,
  interventionId: number,
  action: DeviationPromptAction,
): Promise<DataResult<InterventionRow>> {
  const responded = await recordInterventionResponse(client, interventionId, { status: 'acted_on', actionTaken: action });
  if (!responded.ok) return responded;

  const frictionMapping = frictionCauseForDeviationResponse(action);
  if (frictionMapping) {
    const logged = await logFriction(client, userId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- FrictionCause is a generated
      // enum union; the mapping is already exhaustively checked against it in deviationPrompt.test.ts.
      cause: frictionMapping.cause as any,
      ...(frictionMapping.causeDetail != null ? { causeDetail: frictionMapping.causeDetail } : {}),
      ...(responded.data.related_task_id != null ? { relatedTaskId: responded.data.related_task_id } : {}),
    });
    if (!logged.ok) return logged;
  }

  return responded;
}

/**
 * Commitment escalation: for each active kill habit, checks whether relapses since the
 * ladder was last moved cross the threshold, and -- only if the habit's own
 * max_escalation_level permits it -- actually escalates: updates escalation_level,
 * records the audit-trail row in commitment_escalation_events, and persists an
 * intervention documenting that the escalation action itself fired.
 */
export async function evaluateEscalations(client: TypedSupabaseClient, userId: string, today: LocalDate, now: Date): Promise<DataResult<InterventionRow[]>> {
  const { data: habits, error: habitsError } = await client
    .from('kill_habits')
    .select('id, name, escalation_level, max_escalation_level, created_at')
    .eq('user_id', userId)
    .eq('active', true);
  if (habitsError) return dataErr(mapDataError(habitsError));

  const created: InterventionRow[] = [];
  for (const habit of habits ?? []) {
    const { data: lastEscalation, error: lastEscalationError } = await client
      .from('commitment_escalation_events')
      .select('occurred_at')
      .eq('kill_habit_id', habit.id)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastEscalationError) return dataErr(mapDataError(lastEscalationError));
    const levelSetAt = lastEscalation?.occurred_at ?? habit.created_at;

    const { count: relapsesSinceLevelSet, error: relapsesError } = await client
      .from('kill_events')
      .select('id', { count: 'exact', head: true })
      .eq('kill_habit_id', habit.id)
      .eq('outcome', 'relapsed')
      .gte('occurred_at', levelSetAt);
    if (relapsesError) return dataErr(mapDataError(relapsesError));

    const decision = evaluateEscalation({
      currentLevel: habit.escalation_level as CommitmentLevel,
      relapsesSinceLevelSet: relapsesSinceLevelSet ?? 0,
    });
    if (!decision.shouldEscalate || !decision.recommendedNextLevel) continue;

    const clampedLevel = clampEscalationToOptIn(decision.recommendedNextLevel, habit.max_escalation_level as CommitmentLevel);
    if (!clampedLevel) continue; // evidence supports it, but this habit hasn't opted in that far

    const { error: updateError } = await client.from('kill_habits').update({ escalation_level: clampedLevel }).eq('id', habit.id);
    if (updateError) return dataErr(mapDataError(updateError));

    const { error: eventError } = await client
      .from('commitment_escalation_events')
      .insert({ user_id: userId, kill_habit_id: habit.id, from_level: habit.escalation_level, to_level: clampedLevel, reason: decision.reason });
    if (eventError) return dataErr(mapDataError(eventError));

    const message = `"${habit.name}" escalated to ${clampedLevel} -- ${decision.reason}`;
    const result = await createIntervention(client, userId, {
      kind: 'escalation_action',
      triggerReason: decision.reason!,
      message,
      actions: ['Acknowledge'],
      relatedKillHabitId: habit.id,
    });
    if (!result.ok) return result;
    created.push(result.data);
  }
  return dataOk(created);
}

/**
 * The stale-task surface (FOLLOWUPS.md S5): scans every one of the user's open
 * (not completed/cancelled) tasks -- not date-windowed, since staleness is exactly the
 * signal Recovery Mode's 7-day window deliberately excludes -- and fires a prompt for
 * any past evaluateStaleTaskPrompt's threshold.
 *
 * Deduped per STALENESS EPISODE, not per task lifetime and not per day: an existing
 * stale_task_prompt intervention only blocks a new one if it fired on or after the
 * task's CURRENT planned_date. Re-planning a task (the "Still real" response) moves
 * planned_date forward, which makes any prior intervention's local_date fall BEFORE the
 * new planned_date -- so once the task goes stale again from its new date, it is
 * eligible to prompt again. Without this, a user who taps "Still real" and then never
 * touches the task again would only ever be asked once, and the task would silently
 * rot forever after that -- exactly the failure mode this feature exists to prevent.
 */
export async function evaluateStaleTaskPrompts(client: TypedSupabaseClient, userId: string, today: LocalDate): Promise<DataResult<InterventionRow[]>> {
  const { data: tasks, error: taskError } = await client.from('tasks').select('id, title, planned_date').eq('user_id', userId).not('status', 'in', '(completed,cancelled)');
  if (taskError) return dataErr(mapDataError(taskError));

  // Batched dedupe. Note the rule here is per staleness EPISODE, not per day -- an existing
  // prompt only counts if its local_date is on or after the task's current planned_date, so
  // re-planning a task forward legitimately allows a new prompt later. That comparison moves
  // into memory; it is not relaxed.
  const { data: firedRows, error: firedError } = await client
    .from('interventions')
    .select('related_task_id, local_date')
    .eq('user_id', userId)
    .eq('kind', 'stale_task_prompt');
  if (firedError) return dataErr(mapDataError(firedError));
  const firedForTask = new Map<number, string[]>();
  for (const row of firedRows ?? []) {
    if (row.related_task_id == null) continue;
    const dates = firedForTask.get(row.related_task_id) ?? [];
    dates.push(row.local_date);
    firedForTask.set(row.related_task_id, dates);
  }

  const created: InterventionRow[] = [];
  for (const task of tasks ?? []) {
    const decision = evaluateStaleTaskPrompt({ today, plannedDate: task.planned_date, taskTitle: task.title });
    if (!decision.shouldFire) continue;

    const priorDates = firedForTask.get(task.id) ?? [];
    if (priorDates.some((d) => d >= task.planned_date)) continue;

    const result = await createIntervention(client, userId, {
      kind: 'stale_task_prompt',
      triggerReason: `Planned ${decision.daysSincePlanned} days ago, never started`,
      message: decision.reason!,
      actions: [...STALE_TASK_PROMPT_ACTIONS],
      relatedTaskId: task.id,
    });
    if (!result.ok) return result;
    created.push(result.data);
  }
  return dataOk(created);
}

/**
 * The one-tap response actually changes the task's state, not just acknowledges the
 * prompt -- "Let it go" cancels it (neutral framing deliberately, same reasoning as the
 * kill-list's own copy: abandoning a task that no longer matters is hygiene, not
 * failure, and if it reads as failure users will keep re-planning things they will
 * never do just to avoid the feeling). "Still real" re-plans the task to today, which
 * both keeps it active AND starts a new staleness episode (see
 * evaluateStaleTaskPrompts's dedup reasoning above).
 */
export async function respondToStaleTaskPrompt(
  client: TypedSupabaseClient,
  interventionId: number,
  action: StaleTaskPromptAction,
  today: LocalDate,
): Promise<DataResult<InterventionRow>> {
  const { data: intervention, error: fetchError } = await client.from('interventions').select('related_task_id').eq('id', interventionId).single();
  if (fetchError) return dataErr(mapDataError(fetchError));

  const responded = await recordInterventionResponse(client, interventionId, { status: 'acted_on', actionTaken: action });
  if (!responded.ok) return responded;

  if (intervention.related_task_id != null) {
    if (action === 'Let it go') {
      const cancelled = await updateTaskStatus(client, intervention.related_task_id, 'cancelled');
      if (!cancelled.ok) return cancelled;
    } else if (action === 'Still real') {
      const { error: replanError } = await client.from('tasks').update({ planned_date: today }).eq('id', intervention.related_task_id);
      if (replanError) return dataErr(mapDataError(replanError));
    }
  }

  return responded;
}

/**
 * U1 — runs every intervention evaluator for a user's day, in one call.
 *
 * Until this existed, none of the four evaluators had a caller anywhere in the repo:
 * `evaluateUpcomingBlockNotifications`, `evaluateDeviationPrompts`, `evaluateEscalations`
 * and `evaluateStaleTaskPrompts` were all built and tested and never once ran in the real
 * request path. So no intervention was ever created, delivered, or responded to, and
 * **"Intervene" — a step of the product's core loop — had never executed.** The demo
 * account had zero intervention rows of any kind.
 *
 * Safe to call on every Today load: each evaluator dedupes against what already exists
 * (per day for notifications, deviations and escalations; per *staleness episode* for
 * stale tasks, which is the subtler and more correct rule). Re-running produces nothing
 * new rather than a duplicate.
 *
 * Evaluators run sequentially rather than in parallel on purpose — they each read and then
 * write the same `interventions` table, and their dedupe checks are read-then-insert. Racing
 * them against each other is how you get the duplicates the dedupe exists to prevent.
 *
 * A failing evaluator does NOT abort the sweep. Interventions are advisory: losing one
 * category because another had a bad day should not cost the user the rest, and it must
 * never take down the Today screen that hosts them. Errors are collected and returned so a
 * caller can surface or log them rather than have them vanish.
 */
export interface InterventionSweepResult {
  created: InterventionRow[];
  /** Evaluators that failed, by name. Empty on a clean sweep. Never thrown -- see above. */
  failed: string[];
}

export async function runInterventionSweep(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  now: Date,
): Promise<InterventionSweepResult> {
  const created: InterventionRow[] = [];
  const failed: string[] = [];

  const steps: Array<[string, () => Promise<DataResult<InterventionRow[]>>]> = [
    ['upcomingBlockNotifications', () => evaluateUpcomingBlockNotifications(client, userId, today, now)],
    ['deviationPrompts', () => evaluateDeviationPrompts(client, userId, today, now)],
    ['escalations', () => evaluateEscalations(client, userId, today, now)],
    ['staleTaskPrompts', () => evaluateStaleTaskPrompts(client, userId, today)],
  ];

  for (const [name, run] of steps) {
    const result = await run();
    if (result.ok) created.push(...result.data);
    else failed.push(name);
  }

  return { created, failed };
}
