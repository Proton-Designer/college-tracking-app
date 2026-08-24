import * as Notifications from "expo-notifications";

/**
 * The Hour's 60:00 alert.
 *
 * Verified working in Expo Go on SDK 54 before this was written (both one-shot and
 * repeating daily triggers fire while the phone is locked), which is why this is a local
 * scheduled notification rather than a server push -- push genuinely does not work in Expo
 * Go and would have forced the Phase 4 dev-build fork years early.
 *
 * Notification identifiers are derived from the session id rather than stored, so a
 * scheduled alert can always be cancelled or replaced without keeping a second piece of
 * state in sync with the database. The session id is already the one durable handle on an
 * Hour, and reusing it means an app that was killed mid-Hour can still cancel the right
 * alert when the Hour finally ends.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const identifierFor = (sessionId: number): string => `hour-end-${sessionId}`;

/**
 * Asks for notification permission if it has not been decided yet.
 *
 * Called when an Hour actually starts rather than at app launch: a permission prompt with
 * no context attached is the one most likely to be denied, and a denial here is
 * permanent-ish. Returns false rather than throwing -- a denied prompt must never stop the
 * Hour from starting, it just means no alert at 60:00.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedules (or re-schedules) the alert for one Hour.
 *
 * `endsAt` in the past is a no-op rather than an error: that is the ordinary case when an
 * Hour has already run over and the screen is simply re-reconciling on foreground. Firing
 * an alert immediately for an Hour that ended twenty minutes ago would be noise, and the
 * screen already shows the overrun.
 */
export async function scheduleHourEndAlert(
  sessionId: number,
  hourIndex: number | null,
  deliverable: string | null,
  endsAt: Date,
  now: Date = new Date(),
): Promise<void> {
  if (endsAt.getTime() <= now.getTime()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: identifierFor(sessionId),
      content: {
        title: hourIndex != null ? `Hour ${hourIndex} is done` : "Your Hour is done",
        body: deliverable != null && deliverable.length > 0 ? deliverable : "Log it and take the break.",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: endsAt },
    });
  } catch {
    // A failed schedule must not fail the Hour. The timer on screen remains correct
    // either way -- the alert is a convenience layered on top of it, never the mechanism.
  }
}

/** Cancels an Hour's alert. Safe to call for an Hour that never had one. */
export async function cancelHourEndAlert(sessionId: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifierFor(sessionId));
  } catch {
    // Cancelling something that isn't scheduled is not a failure worth surfacing.
  }
}
