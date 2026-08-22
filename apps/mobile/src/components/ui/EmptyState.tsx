import { color, radius, space } from "@collegeos/design/native";
import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { textStyle } from "../../design/typography";
import { Button } from "./Button";
import { GlassSurface } from "./GlassSurface";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Escape hatch for a caller that owns its own trigger + modal (e.g. AddCourseModal) --
   *  same rationale as web's EmptyState: mirrors apps/web/src/components/ui/EmptyState.tsx's
   *  `action` slot exactly. Takes precedence over actionLabel/onAction when both are given. */
  action?: ReactNode;
}

const DASH_LEN = 4;
const DASH_GAP = 3;
const DASH_THICKNESS = 1;

// RN's `borderStyle: "dashed"` renders solid on iOS once `borderRadius > 0` -- same platform
// bug fixed the same way in DayTrace/MitList: compose the border from small Views instead of
// the native border renderer, so it's genuinely dashed rather than a plain box that happens to
// look identical to every other bordered panel. Self-measures via onLayout since (unlike
// DayTrace) this box's size depends on its own content, not a fixed timeline width.
function DashedBorder({ width, height }: { width: number; height: number }) {
  if (width === 0 || height === 0) return null;
  const hCount = Math.max(1, Math.round(width / (DASH_LEN + DASH_GAP)));
  const vCount = Math.max(1, Math.round(height / (DASH_LEN + DASH_GAP)));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.hRow, { top: 0 }]}>
        {Array.from({ length: hCount }, (_, i) => (
          <View key={i} style={styles.hDash} />
        ))}
      </View>
      <View style={[styles.hRow, { bottom: 0 }]}>
        {Array.from({ length: hCount }, (_, i) => (
          <View key={i} style={styles.hDash} />
        ))}
      </View>
      <View style={[styles.vColumn, { left: 0 }]}>
        {Array.from({ length: vCount }, (_, i) => (
          <View key={i} style={styles.vDash} />
        ))}
      </View>
      <View style={[styles.vColumn, { right: 0 }]}>
        {Array.from({ length: vCount }, (_, i) => (
          <View key={i} style={styles.vDash} />
        ))}
      </View>
    </View>
  );
}

/** §2/§7 -- a `glass-sunken` well (the tier's own table names "empty states" explicitly),
 *  with no shadow: recessed, not floating, same reasoning as Input. Glass does not get to
 *  make an empty screen look full -- the fill stays at its normal 0.38 alpha, no extra tint,
 *  and the dashed edge (this component's own pre-existing "this is a placeholder" signifier)
 *  is unchanged. States what the screen is for and gives one action. Never an illustration,
 *  never a mood. */
export function EmptyState({ title, description, actionLabel, onAction, action }: EmptyStateProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }

  return (
    <GlassSurface tier="sunken" style={styles.clip} contentStyle={styles.container}>
      <View style={StyleSheet.absoluteFill} onLayout={handleLayout}>
        <DashedBorder width={size.width} height={size.height} />
      </View>
      <Text style={textStyle("title", color.ink)}>{title}</Text>
      <Text style={textStyle("body", color.inkMuted)}>{description}</Text>
      {action ?? (actionLabel && onAction ? (
        <Button variant="secondary" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null)}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderRadius: radius.lg,
  },
  container: {
    alignItems: "flex-start",
    gap: space[3],
    padding: space[8],
  },
  hRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  hDash: {
    width: DASH_LEN,
    height: DASH_THICKNESS,
    backgroundColor: color.hairline,
    marginRight: DASH_GAP,
  },
  vColumn: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  vDash: {
    width: DASH_THICKNESS,
    height: DASH_LEN,
    backgroundColor: color.hairline,
    marginBottom: DASH_GAP,
  },
});
