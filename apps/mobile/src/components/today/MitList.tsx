import type { Confidence } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Checkbox } from "../ui/Checkbox";
import { ConfidenceRule, type ConfidenceLineStyle } from "../ui/ConfidenceRule";
import { textStyle } from "../../design/typography";
import { formatLoggedMinutesSuffix } from "../../lib/loggedMinutes";
import { toggleTaskCompletion } from "../../lib/todayActions";

export interface MitItem {
  taskId: number;
  rank: number;
  title: string;
  courseCode: string | null;
  completed: boolean;
  calibratedMinutes: number;
  calibrationConfidence: Confidence;
  /** Real minutes actually logged against this task today, summed from ended focus
   *  sessions (never a fabricated or rounded-up figure). `null` when nothing's been
   *  logged yet -- absent, not "0 min logged today": a session that hasn't happened
   *  and a session that logged exactly zero minutes are different facts (R1). */
  loggedMinutesToday: number | null;
}

/** DESIGN_SYSTEM §6.2: line style encodes epistemic status, ratified system-wide. `low` and
 *  `insufficient` both read as "hypothesis" — there's no fourth visual tier. */
const CONFIDENCE_BORDER: Record<Confidence, ConfidenceLineStyle> = {
  high: "solid",
  moderate: "dashed",
  low: "dotted",
  insufficient: "dotted",
};

export function MitList({
  items,
  onToggle,
}: {
  items: MitItem[];
  /** Mirrors this list's own optimistic completion state up to the caller -- the header's
   *  headline/progress-line are computed from the same array this list renders, and would
   *  silently disagree with a checkbox the user just ticked if they didn't share it. Called
   *  again with the rolled-back value if the server call fails, same as this list's own undo. */
  onToggle?: (taskId: number, completed: boolean) => void;
}) {
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
    onToggle?.(taskId, checked);

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
        onToggle?.(taskId, !checked);
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
                <Text style={textStyle("caption", color.inkFaint)}>
                  ~{Math.round(item.calibratedMinutes)} min
                  {formatLoggedMinutesSuffix(item.loggedMinutesToday)}
                </Text>
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
    gap: space[3],
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
