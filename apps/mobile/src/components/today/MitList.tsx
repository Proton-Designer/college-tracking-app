import type { Confidence } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Checkbox } from "../ui/Checkbox";
import { textStyle } from "../../design/typography";
import { toggleTaskCompletion } from "../../lib/todayActions";

export interface MitItem {
  taskId: number;
  rank: number;
  title: string;
  courseCode: string | null;
  completed: boolean;
  calibratedMinutes: number;
  calibrationConfidence: Confidence;
}

type LineStyle = "solid" | "dashed" | "dotted";

/** DESIGN_SYSTEM §6.2: line style encodes epistemic status, ratified system-wide. `low` and
 *  `insufficient` both read as "hypothesis" — there's no fourth visual tier. */
const CONFIDENCE_BORDER: Record<Confidence, LineStyle> = {
  high: "solid",
  moderate: "dashed",
  low: "dotted",
  insufficient: "dotted",
};

// RN's `borderStyle: 'dashed'/'dotted'` frequently renders as solid on iOS — composing the
// rule from small Views (same fix as DayTrace.tsx) so dashed/dotted/solid are genuinely three
// distinct states rather than gambling on the native renderer for a ratified convention.
// The dash/dot segments are absolutely positioned inside ruleTrack so they never contribute to
// its own layout size — ruleTrack's height comes purely from `alignSelf: stretch` matching
// itemContent, same as the solid case. A prior version stacked the segments as normal flow
// children, which gave ruleTrack a large intrinsic height of its own and forced the whole row
// (and itemContent, via the row's default stretch) to grow to fit it, producing dead space
// below short rows — worse for dashed/dotted than solid since they had more/taller segments.
const RULE_SEGMENTS = 20;
const RULE_GAP = 3;

function ConfidenceRule({ lineStyle, ruleColor }: { lineStyle: LineStyle; ruleColor: string }) {
  if (lineStyle === "solid") {
    return <View style={[styles.ruleTrack, { backgroundColor: ruleColor }]} />;
  }
  const segLen = lineStyle === "dotted" ? 2 : 5;
  return (
    <View style={styles.ruleTrack}>
      {Array.from({ length: RULE_SEGMENTS }, (_, i) => i).map((i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: i * (segLen + RULE_GAP),
            width: 2,
            height: segLen,
            backgroundColor: ruleColor,
          }}
        />
      ))}
    </View>
  );
}

export function MitList({ items }: { items: MitItem[] }) {
  const [completedIds, setCompletedIds] = useState<Set<number>>(
    () => new Set(items.filter((i) => i.completed).map((i) => i.taskId)),
  );
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  function handleToggle(taskId: number, checked: boolean) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    startTransition(async () => {
      const result = await toggleTaskCompletion(taskId, checked ? "completed" : "pending");
      if (!result.ok) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(taskId);
          else next.add(taskId);
          return next;
        });
        setFailedIds((prev) => new Set(prev).add(taskId));
      }
    });
  }

  if (items.length === 0) {
    return <Text style={textStyle("body", color.inkMuted)}>No MITs selected for today.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map((item) => {
        const completed = completedIds.has(item.taskId);
        const failed = failedIds.has(item.taskId);
        return (
          <View key={item.taskId} style={styles.item}>
            <ConfidenceRule lineStyle={CONFIDENCE_BORDER[item.calibrationConfidence]} ruleColor={color.inkMuted} />
            <View style={styles.itemContent}>
              <Checkbox
                label={item.title}
                checked={completed}
                disabled={isPending && !failed}
                onValueChange={(checked) => handleToggle(item.taskId, checked)}
                error={failed ? "Couldn't save — check your connection and try again." : undefined}
              />
              <View style={styles.captionRow}>
                {item.courseCode ? <Text style={textStyle("caption", color.inkFaint)}>{item.courseCode}</Text> : null}
                <Text style={textStyle("caption", color.inkFaint)}>~{Math.round(item.calibratedMinutes)} min</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[5],
  },
  item: {
    flexDirection: "row",
  },
  ruleTrack: {
    width: 2,
    marginRight: space[3],
    alignSelf: "stretch",
    overflow: "hidden",
  },
  itemContent: {
    flex: 1,
    gap: space[1],
  },
  captionRow: {
    flexDirection: "row",
    gap: space[3],
    marginLeft: 20 + space[3],
  },
});
