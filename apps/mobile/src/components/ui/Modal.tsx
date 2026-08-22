import { color, duration, radius, shadow, space, spring } from "@collegeos/design/native";
import { useEffect, type ReactNode } from "react";
import { Modal as RNModal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { textStyle } from "../../design/typography";
import { useReducedMotion } from "../../lib/useReducedMotion";

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string | undefined;
  children: ReactNode;
  /** Right-aligned footer row, e.g. Cancel/Save. */
  footer?: ReactNode | undefined;
  /** Backdrop tap and Android back button close the sheet. Default true. */
  dismissable?: boolean | undefined;
}

/** A bottom sheet, not a centered dialog -- DESIGN_SYSTEM §5 defines a dedicated "sheet"
 *  spring separate from "standard," which only makes sense for something that slides up
 *  from an edge. The one documented "overlay" shadow (the only shadow this system allows on
 *  a genuinely floating element) goes here. */
export function Modal({ visible, onClose, title, children, footer, dismissable = true }: ModalProps) {
  if (!visible) return null;
  return (
    <RNModal transparent animationType="none" visible onRequestClose={dismissable ? onClose : () => {}} statusBarTranslucent>
      <ModalContent onClose={onClose} title={title} footer={footer} dismissable={dismissable}>
        {children}
      </ModalContent>
    </RNModal>
  );
}

function ModalContent({
  onClose,
  title,
  children,
  footer,
  dismissable,
}: Omit<ModalProps, "visible">) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const sheetY = useSharedValue(reducedMotion ? 0 : 40);
  const backdropOpacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    sheetY.value = reducedMotion ? 0 : withSpring(0, spring.sheet);
    backdropOpacity.value = reducedMotion ? 1 : withTiming(1, { duration: duration.quick });
    // Runs once on mount only -- this is the sheet's entrance, not a response to prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
      </Animated.View>
      <Animated.View
        style={[styles.sheet, shadow.overlay, { paddingBottom: insets.bottom + space[5] }, sheetStyle]}
      >
        {title ? <Text style={[textStyle("title", color.ink), styles.title]}>{title}</Text> : null}
        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: "rgba(22, 24, 29, 0.4)",
  },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space[5],
    paddingTop: space[5],
    maxHeight: "85%",
  },
  title: {
    marginBottom: space[4],
  },
  body: {
    flexGrow: 0,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space[3],
    marginTop: space[5],
  },
});
