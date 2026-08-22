import { color, glass, radius, shadow, space } from "@collegeos/design/native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { GlassSurface } from "./GlassSurface";

export type ToastVariant = "default" | "success" | "error";

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  onDismiss?: () => void;
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  default: glass.edgeHairline,
  success: color.riskLow,
  error: color.riskCritical,
};

/** A floating overlay -- §2's glass tier table groups "popovers" with modals/sheets under
 *  `raised`, and a toast is exactly that: `shadow.lifted` replaces the v1 `shadow.popover`
 *  alias this file used to reach for. Shadow lives on an outer, non-clipped wrapper --
 *  same split as Panel/Modal, since a view's own `overflow: hidden` (GlassSurface's clip)
 *  clips its own shadow on iOS, not just its children. */
export function Toast({ variant = "default", message, onDismiss }: ToastProps) {
  return (
    <View style={[styles.shadowWrap, shadow.lifted]}>
      <GlassSurface tier="raised" style={[styles.clip, { borderColor: VARIANT_BORDER[variant] }]} contentStyle={styles.row}>
        <Text style={[textStyle("bodyS", color.ink), styles.message]}>{message}</Text>
        {onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
            <Text style={textStyle("body", color.inkFaint)}>✕</Text>
          </Pressable>
        ) : null}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.md,
  },
  clip: {
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },
  message: {
    flex: 1,
  },
});
