import { useBottomTabBarHeight } from "expo-router/tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Standard iOS bottom-tab-bar chrome height, excluding the safe-area inset. */
const TAB_BAR_CHROME_HEIGHT = 49;

/**
 * Confirmed live, on-device: on the very first paint after a `(tabs)` screen mounts,
 * `useBottomTabBarHeight()` (or its propagation into a consuming component's style)
 * hasn't settled yet -- content near the bottom of the screen renders as if the tab bar
 * reserved zero space, overlapping it and stealing its taps, and only self-corrects after
 * an unrelated layout event (e.g. a scroll gesture) forces a re-measure. A real user
 * tapping shortly after a screen appears hits exactly this window.
 *
 * The frame-one fallback is `insets.bottom + 49` (`useSafeAreaInsets()` IS available on
 * first render, unlike the tab bar hook) rather than a bare constant: standard iOS tab
 * bar chrome is ~49pt plus the device's own safe-area bottom inset, so this estimate is
 * derived from the real device -- correct on both notched and non-notched hardware and at
 * larger Dynamic Type sizes -- rather than a guess that quietly under-shoots on some
 * phones. `Math.max` still lets the live-measured value win once it resolves.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  const measured = useBottomTabBarHeight();
  return Math.max(insets.bottom + TAB_BAR_CHROME_HEIGHT, measured);
}
