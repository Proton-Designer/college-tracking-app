import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { auroraForRisk, type RiskBand } from "@collegeos/design/native";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { useReducedTransparency } from "../../lib/useReducedTransparency";

export interface AuroraProps {
  /** The real computed band this screen is reporting, or null. Never fabricate one to make a
   *  screen look alive -- `auroraForRisk(null)` is a first-class value: no history, no
   *  atmosphere. See DESIGN_LANGUAGE_V2 §6. */
  band: RiskBand | null;
}

/**
 * The ambient field, §6 -- an instrument reading, not decoration. Its hue mix is derived from a
 * real computed RiskBand and it renders once per navigation; it never animates, pulses, or
 * breathes. `prefers-reduced-motion` and `prefers-reduced-transparency` both collapse it to flat
 * ground, same as a null band. Ambient only -- risk is always also stated in text and a RiskPill.
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

  const stops = reducedMotion || reducedTransparency ? null : auroraForRisk(band);
  if (!stops) return null;
  const [a, b] = stops;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.container]}>
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

const styles = StyleSheet.create({
  container: {
    opacity: 0.35,
  },
});
