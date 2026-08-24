import * as Notifications from "expo-notifications";
import { ensureNotificationPermission, hasNotificationPermission } from "./notifications";

/**
 * The 9:30 PM Night Plan reminder.
 *
 * BLUEPRINT Part VII calls the nightly anchor the single highest-leverage retention choice
 * in the design -- willpower is lowest in the morning, so what actually starts Hour 1 is
 * the plan already being made. A ritual that depends on remembering to open the app is the
 * ritual that stops happening, which is why this exists at all.
 *
 * A repeating DAILY calendar trigger, verified firing on a locked device in Expo Go before
 * this was built. One fixed identifier means scheduling is idempotent: re-running it
 * replaces the existing schedule rather than stacking a second nightly banner.
 */

const NIGHT_PLAN_IDENTIFIER = "night-plan-daily";

/**
 * 21:30 local. Hard-coded for now, and deliberately so: Part VII allows exactly three
 * notification types ever, and a settings surface for this is a Tier 3 concern at the
 * earliest. When it becomes configurable it should move to `profiles`, not a device-local
 * preference -- the reminder is about the user's day, not their handset.
 */
const NIGHT_PLAN_HOUR = 21;
const NIGHT_PLAN_MINUTE = 30;

export interface NightPlanReminderState {
  permitted: boolean;
  scheduled: boolean;
}

export async function getNightPlanReminderState(): Promise<NightPlanReminderState> {
  const permitted = await hasNotificationPermission();
  if (!permitted) return { permitted: false, scheduled: false };
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return { permitted: true, scheduled: all.some((n) => n.identifier === NIGHT_PLAN_IDENTIFIER) };
  } catch {
    return { permitted: true, scheduled: false };
  }
}

/**
 * Ensures the nightly reminder exists.
 *
 * `promptIfNeeded` defaults to false so the app can call this on launch and silently do
 * nothing when permission was never granted. Prompting cold, before the user has seen what
 * the reminder is for, is exactly the denial-inducing pattern the Hour's alert avoids --
 * the Night Plan screen passes true, because there the reason is on screen.
 */
export async function ensureNightPlanReminder(promptIfNeeded = false): Promise<boolean> {
  const permitted = promptIfNeeded
    ? await ensureNotificationPermission()
    : await hasNotificationPermission();
  if (!permitted) return false;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NIGHT_PLAN_IDENTIFIER,
      content: {
        title: "Plan tomorrow",
        body: "Two minutes now is what starts Hour 1 tomorrow.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: NIGHT_PLAN_HOUR,
        minute: NIGHT_PLAN_MINUTE,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Turns the nightly reminder off. The user's call, not the app's. */
export async function cancelNightPlanReminder(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(NIGHT_PLAN_IDENTIFIER);
  } catch {
    // Cancelling something not scheduled is not a failure worth surfacing.
  }
}

/** Display string for the reminder time, so the UI never hard-codes it a second time. */
export const NIGHT_PLAN_REMINDER_LABEL = `${NIGHT_PLAN_HOUR > 12 ? NIGHT_PLAN_HOUR - 12 : NIGHT_PLAN_HOUR}:${String(
  NIGHT_PLAN_MINUTE,
).padStart(2, "0")} ${NIGHT_PLAN_HOUR >= 12 ? "PM" : "AM"}`;
