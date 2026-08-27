import { useEffect } from "react";
import { AppState } from "react-native";

/**
 * Re-runs `refresh` whenever the app returns to the foreground. There is no realtime layer
 * on mobile (or anywhere in this repo), so a write made elsewhere -- another device, or the
 * same device while this screen wasn't mounted -- is otherwise invisible until the screen
 * happens to remount. Extracted from WorkEngineSection, which established this pattern first.
 */
export function useRefreshOnForeground(refresh: () => void | Promise<void>): void {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
}
