import { color, radius, space } from "@collegeos/design/native";
import { Pressable, StyleSheet, Text } from "react-native";
import { textStyle } from "../../design/typography";

export interface NavLinkProps {
  label: string;
  direction?: "back" | "forward";
  onPress: () => void;
}

/** A small nav affordance with real button chrome (hairline border, padding, press
 *  feedback) -- root-level screens outside the tab bar need a way back/forward that
 *  isn't a bare native header, and a plain arrow glyph floating with no visual weight
 *  reads as unstyled rather than as a control. */
export function NavLink({ label, direction = "back", onPress }: NavLinkProps) {
  const glyph = direction === "back" ? "‹ " : " ›";
  const text = direction === "back" ? `${glyph}${label}` : `${label}${glyph}`;
  // The visible text bakes the direction into a glyph for sighted users -- without an
  // explicit label, a screen reader would either skip the decorative arrow character or
  // read its raw Unicode name, and would never announce this as a control at all (no
  // accessibilityRole). Both looked fine and were broken for VoiceOver until named here.
  const accessibilityLabel = direction === "back" ? `Back to ${label}` : label;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.base, pressed ? styles.pressed : null]}
    >
      <Text style={textStyle("label", color.inkMuted)}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surface,
  },
  pressed: {
    backgroundColor: color.surfaceSunken,
  },
});
