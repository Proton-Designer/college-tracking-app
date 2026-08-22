import { color, radius, space } from "@collegeos/design/native";
import { Pressable, StyleSheet, Text } from "react-native";
import { textStyle } from "../../design/typography";
import { GlassSurface } from "./GlassSurface";

export interface NavLinkProps {
  label: string;
  direction?: "back" | "forward";
  onPress: () => void;
}

/** A small nav affordance with real button chrome -- `glass-base`, the same "chip resting on
 *  the ground" material as Button's secondary variant and ChipGroup's unselected chip.
 *  Root-level screens outside the tab bar need a way back/forward that isn't a bare native
 *  header, and a plain arrow glyph floating with no visual weight reads as unstyled rather
 *  than as a control. */
export function NavLink({ label, direction = "back", onPress }: NavLinkProps) {
  const glyph = direction === "back" ? "‹ " : " ›";
  const text = direction === "back" ? `${glyph}${label}` : `${label}${glyph}`;
  // The visible text bakes the direction into a glyph for sighted users -- without an
  // explicit label, a screen reader would either skip the decorative arrow character or
  // read its raw Unicode name, and would never announce this as a control at all (no
  // accessibilityRole). Both looked fine and were broken for VoiceOver until named here.
  const accessibilityLabel = direction === "back" ? `Back to ${label}` : label;
  return (
    <GlassSurface tier="base" style={styles.clip} contentStyle={styles.content}>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.inner, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={textStyle("label", color.inkMuted)}>{text}</Text>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  clip: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
  },
  content: {
    alignSelf: "flex-start",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
});
