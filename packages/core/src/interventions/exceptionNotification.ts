/**
 * Exception-based notifications only (the brief, L9): a notification fires when a
 * deterministic condition is met -- never on a timer, never generic encouragement.
 * "11:00 Remember your goals!" is explicitly rejected; "Your BME block begins in 8
 * min. You've used 41 min of social media today." is the model -- a specific, cited
 * fact plus at least one action.
 */

export interface UpcomingBlockCheckInput {
  now: Date;
  /** When the timeboxed task is planned to start (tasks.planned_start_at). */
  plannedStartAt: Date;
  taskTitle: string;
  /** Null when no screen-time rollup exists for today yet -- "0 min" would silently
   *  claim a verified zero, which is a fabrication when the real answer is "unknown." */
  screenTimeMinutesToday: number | null;
  /** How far ahead of the start time to warn. Default 10 -- close enough to be
   *  actionable, far enough to actually move the block if needed. */
  leadTimeMinutes?: number;
}

export interface ExceptionNotificationDecision {
  shouldFire: boolean;
  /** The specific, citable fact -- null when shouldFire is false, since there's
   *  nothing to cite. */
  reason: string | null;
  minutesUntilStart: number;
}

const DEFAULT_LEAD_TIME_MINUTES = 10;

export function evaluateUpcomingBlockNotification(input: UpcomingBlockCheckInput): ExceptionNotificationDecision {
  const leadTimeMinutes = input.leadTimeMinutes ?? DEFAULT_LEAD_TIME_MINUTES;
  const minutesUntilStart = Math.round((input.plannedStartAt.getTime() - input.now.getTime()) / 60_000);

  // Fires exactly once, in the window (0, leadTimeMinutes] -- already-passed starts are
  // deviation-prompt territory (see deviationPrompt.ts), not an upcoming-block warning.
  const shouldFire = minutesUntilStart > 0 && minutesUntilStart <= leadTimeMinutes;
  if (!shouldFire) return { shouldFire: false, reason: null, minutesUntilStart };

  const screenTimeClause = input.screenTimeMinutesToday != null ? ` You've used ${input.screenTimeMinutesToday} min of social media today.` : '';
  const reason = `${input.taskTitle} begins in ${minutesUntilStart} min.${screenTimeClause}`;
  return { shouldFire: true, reason, minutesUntilStart };
}
