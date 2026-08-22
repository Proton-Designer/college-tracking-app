import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Mirrors web's `prefers-reduced-motion` handling (packages/design/src/tailwind.css) --
 *  components that animate state changes must render at full extent instantly instead when
 *  this is true, rather than skip the motion silently with no native equivalent at all. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
