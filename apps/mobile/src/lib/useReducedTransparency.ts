import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Mirrors web's `prefers-reduced-transparency` -- iOS-only in practice. react-native-web's
 *  AccessibilityInfo shim doesn't implement this API at all (undefined, not just `false`), and
 *  Android has no equivalent OS setting either, so both honestly resolve `false` here rather
 *  than throwing or guessing. */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled !== "function") {
      return;
    }
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
