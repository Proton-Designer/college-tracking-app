import { color, radius, shadow, space } from "@collegeos/design/native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export type ToastVariant = "default" | "success" | "error";

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  onDismiss?: () => void;
}

const VARIANT_BORDER: Record<ToastVariant, string> = {
  default: color.hairline,
  success: color.riskLow,
  error: color.riskCritical,
};

export function Toast({ variant = "default", message, onDismiss }: ToastProps) {
  return (
    <View style={[styles.container, { borderColor: VARIANT_BORDER[variant] }, shadow.popover]}>
      <Text style={[textStyle("bodyS", color.ink), styles.message]}>{message}</Text>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
          <Text style={textStyle("body", color.inkFaint)}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.surface,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },
  message: {
    flex: 1,
  },
});
