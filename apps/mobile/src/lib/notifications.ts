import * as Notifications from "expo-notifications";

/**
 * Shared notification setup. Extracted from hourNotifications when the Night Plan reminder
 * became a second consumer: `setNotificationHandler` is global, so two modules each calling
 * it is a last-import-wins race rather than two configurations, and the permission helper
 * has no reason to belong to the Hour.
 *
 * Local notifications only. Push does not work in Expo Go and is a Phase 4 dev-build item;
 * everything scheduled here fires from the device.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** True when notifications are already permitted. Never prompts. */
export async function hasNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Asks for permission if it has not been decided yet.
 *
 * Callers are expected to invoke this at a moment where the reason is obvious on screen. A
 * prompt with no context attached is the one most likely to be denied, and a denial is
 * close to permanent. Returns false rather than throwing, so a denial degrades a feature
 * instead of breaking a flow.
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
