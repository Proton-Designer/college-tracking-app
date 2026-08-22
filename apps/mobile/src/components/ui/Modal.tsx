import { BlurView } from "expo-blur";
import { color, duration, glass, glassEdge, radius, shadow, space, spring } from "@collegeos/design/native";
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

/** A bottom sheet, not a centered dialog -- the design system defines a dedicated "sheet"
 *  spring separate from "standard," which only makes sense for something that slides up from
 *  an edge. §2/§5: a sheet is `glass.raised` at `radius.xl` with `shadow.lifted` -- the same
 *  tier and corner radius as the island, since both are floating glass on an edge.
 *  Android renders `glass.raised.fill` as a solid fill here, never a blur, unless
 *  `blurTarget` is wired -- see FOLLOWUPS G1. */
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
      <Animated.View style={[styles.sheetShadow, sheetStyle]}>
        <View style={[styles.sheetClip, glassEdge, styles.sheetClipBorder]}>
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.raised.fill }]} />
          <View style={[styles.sheetInner, { paddingBottom: insets.bottom + space[5] }]}>
            {title ? (
              <Text accessibilityRole="header" style={[textStyle("title", color.ink), styles.title]}>
                {title}
              </Text>
            ) : null}
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </View>
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
    backgroundColor: "rgba(14,18,32,0.4)",
  },
  sheetShadow: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.lifted,
  },
  sheetClip: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: "hidden",
    maxHeight: "85%",
  },
  sheetClipBorder: {
    borderBottomWidth: 0,
  },
  sheetInner: {
    paddingHorizontal: space[5],
    paddingTop: space[5],
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
