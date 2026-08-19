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
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.base, pressed ? styles.pressed : null]}>
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
