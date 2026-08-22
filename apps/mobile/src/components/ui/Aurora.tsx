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
 * RN has no radial-gradient primitive (web's Aurora uses two CSS radial-gradients); this
 * approximates the same two-blob field with two overlapping linear gradients fading to
 * transparent, angled from the top corners web's version anchors to.
 */
export function Aurora({ band }: AuroraProps) {
  const reducedMotion = useReducedMotion();
  const reducedTransparency = useReducedTransparency();

  const stops = reducedMotion || reducedTransparency ? null : auroraForRisk(band);
  if (!stops) return null;
  const [a, b] = stops;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[a, "transparent"]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.75, y: 0.65 }}
        style={[StyleSheet.absoluteFill, styles.blob]}
      />
      <LinearGradient
        colors={[b, "transparent"]}
        start={{ x: 0.95, y: 0 }}
        end={{ x: 0.3, y: 0.6 }}
        style={[StyleSheet.absoluteFill, styles.blob]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    opacity: 0.55,
  },
});
