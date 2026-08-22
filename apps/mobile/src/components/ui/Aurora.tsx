import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { aurora, auroraForRisk, type RiskBand } from "@collegeos/design/native";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { useReducedTransparency } from "../../lib/useReducedTransparency";

export interface AuroraProps {
  /** The real computed band this screen is reporting, or null. Never fabricate one to make a
   *  screen look alive -- `auroraForRisk(null)` is a first-class value: no history, no
   *  atmosphere. See DESIGN_LANGUAGE_V2 §6. */
  band: RiskBand | null;
}

/** §6.0 -- the resting wash. A screen with no computed band doesn't go bare: on a flat-ground
 *  screen (insights, settings, focus, deliverable detail...) glass only reads as glass when
 *  there's something behind it to refract, so bare `ground` made half the app look like a
 *  different, plainer product from the other half. This pair reports nothing and never varies
 *  -- the same reasoning as the landing page's fixed bloom -- so it can't be mistaken for a
 *  reading. It and the derived aurora never stack; exactly one gradient renders, chosen below. */
const RESTING_WASH_OPACITY = 0.15;
const DERIVED_AURORA_OPACITY = 0.35;

/**
 * The ambient field, §6 -- an instrument reading when a band exists, a fixed resting wash (§6.0)
 * when it doesn't. Its hue mix is derived from a real computed RiskBand and it renders once per
 * navigation; it never animates, pulses, or breathes. `prefers-reduced-motion` and
 * `prefers-reduced-transparency` both collapse it to flat ground. Ambient only -- risk is always
 * also stated in text and a RiskPill.
 *
 * §1: the aurora stops are "never used as fills for components" -- a full-bleed, full-opacity
 * gradient covering the whole viewport IS a fill, and reads as a saturated tinted app rather
 * than atmosphere over the cool ground. This is a single gradient (not two overlapping layers
 * whose opacities compound where they overlap), one opacity multiplier applied once, blooming
 * from the top and fading to transparent well before mid-page -- a bloom in the corner of the
 * room, not colored paper under the glass panels.
 */
export function Aurora({ band }: AuroraProps) {
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();
  if (reducedMotion || reducedTransparency) return null;

  const derived = auroraForRisk(band);
  const [a, b] = derived ?? [aurora.periwinkle, aurora.lilac];
  const opacity = derived ? DERIVED_AURORA_OPACITY : RESTING_WASH_OPACITY;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <LinearGradient
        colors={[a, b, "transparent"]}
        locations={[0, 0.3, 0.6]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
