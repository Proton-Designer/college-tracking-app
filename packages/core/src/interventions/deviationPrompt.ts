/**
 * Deviation detection -> one-tap behavioral capture (the brief, L9): "BME block hasn't
 * started. Why? [Forgot] [Avoiding] [Schedule changed] [Start now]". The tap IS the
 * data -- each reason button maps deterministically to a real friction_logs cause
 * (packages/core §9's aggregation input), so the nudge and the "database of why the
 * user fails" are the same event, not two separate systems.
 */

export const DEVIATION_PROMPT_ACTIONS = ['Forgot', 'Avoiding', 'Schedule changed', 'Start now'] as const;
export type DeviationPromptAction = (typeof DEVIATION_PROMPT_ACTIONS)[number];

export interface DeviationCheckInput {
  now: Date;
  plannedStartAt: Date;
  taskTitle: string;
  /** Whether a focus session has actually been started for this task -- if so, there's
   *  no deviation to report regardless of how the plan/actual timestamps compare. */
  sessionStarted: boolean;
  /** How late before flagging a deviation. Default 15 -- long enough that a normal
   *  transition delay (walking to the library, finishing a conversation) doesn't fire
   *  a prompt for ordinary friction, short enough to still be actionable same-block. */
  graceMinutes?: number;
}

export interface DeviationDecision {
  shouldFire: boolean;
  reason: string | null;
  minutesLate: number;
}

const DEFAULT_GRACE_MINUTES = 15;

export function evaluateDeviationPrompt(input: DeviationCheckInput): DeviationDecision {
  if (input.sessionStarted) return { shouldFire: false, reason: null, minutesLate: 0 };

  const graceMinutes = input.graceMinutes ?? DEFAULT_GRACE_MINUTES;
  const minutesLate = Math.round((input.now.getTime() - input.plannedStartAt.getTime()) / 60_000);
  const shouldFire = minutesLate >= graceMinutes;
  if (!shouldFire) return { shouldFire: false, reason: null, minutesLate };

  return { shouldFire: true, reason: `${input.taskTitle} hasn't started.`, minutesLate };
}

/**
 * The deterministic mapping from a one-tap response to a real friction cause
 * (matches the DB's `friction_cause` enum exactly -- see migration 0002). "Start now"
 * is compliance, not a failure explanation, so it deliberately maps to null: no
 * friction log gets written for choosing to comply. "Forgot" has no dedicated enum
 * value; "other" plus the literal button text as the detail is the honest fit, not a
 * fabricated new cause the DB doesn't actually have.
 */
export function frictionCauseForDeviationResponse(action: DeviationPromptAction): { cause: string; causeDetail?: string } | null {
  switch (action) {
    case 'Forgot':
      return { cause: 'other', causeDetail: 'Forgot' };
    case 'Avoiding':
      return { cause: 'avoided_task' };
    case 'Schedule changed':
      return { cause: 'schedule_changed' };
    case 'Start now':
      return null;
  }
}
