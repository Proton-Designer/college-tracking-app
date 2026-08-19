import type { Task } from "@collegeos/api";
import type { MvdCandidateItem, MvdPlan, RecoveryModeResult } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

const SIGNAL_LABEL: Record<string, string> = {
  lowSleep: "Slept less than your baseline",
  lowWhoopRecovery: "Low WHOOP recovery",
  overdueTasks: "Tasks overdue",
  hardDeadlinesSoon: "Hard deadline within 48 hours",
  missedCheckin: "Missed yesterday's check-in",
  zeroMitCompletion: "No MITs completed yesterday",
  heavyCalendar: "Calendar heavily committed today",
  compressedBackplan: "A deadline's backplan is compressed",
};

const KIND_LABEL: Record<MvdCandidateItem["kind"], string> = {
  hardDeadline: "Hard deadline",
  attendance: "Class / commitment",
  studyBlock: "Study block",
  other: "Task",
};

function itemLabel(item: MvdCandidateItem, tasksById: Map<number, Task>): string {
  if (item.id.startsWith("event-")) return KIND_LABEL[item.kind];
  const task = tasksById.get(Number(item.id));
  return task?.title ?? KIND_LABEL[item.kind];
}

export function RecoveryBanner({
  recoveryMode,
  mvdPlan,
  todayTasks,
}: {
  recoveryMode: RecoveryModeResult;
  mvdPlan: MvdPlan | null;
  todayTasks: Task[];
}) {
  const [expanded, setExpanded] = useState(false);
  const tasksById = new Map(todayTasks.map((t) => [t.id, t]));
  const activeSignals = recoveryMode.signals.filter((s) => s.active);

  return (
    <View style={styles.container}>
      <Text style={textStyle("label", color.riskHigh)}>Recovery Mode active</Text>
      <Text style={[textStyle("body", color.ink), styles.intro]}>
        Today is scaled down to the minimum viable day. Nothing that doesn&apos;t fit is dropped — it&apos;s rolled
        forward, and you can see exactly what.
      </Text>

      <View style={styles.section}>
        <Text style={textStyle("label", color.inkMuted)}>Why</Text>
        {activeSignals.map((signal) => (
          <Text key={signal.key} style={textStyle("bodyS", color.inkMuted)}>
            {SIGNAL_LABEL[signal.key] ?? signal.key}
          </Text>
        ))}
      </View>

      {mvdPlan ? (
        <View style={styles.section}>
          <Text style={textStyle("label", color.inkMuted)}>Kept today</Text>
          {mvdPlan.kept.map((item) => (
            <Text key={item.id} style={textStyle("bodyS", color.ink)}>
              {itemLabel(item, tasksById)}
            </Text>
          ))}

          {mvdPlan.deferred.length > 0 ? (
            <Pressable onPress={() => setExpanded((v) => !v)} style={styles.disclosure}>
              <Text style={textStyle("label", color.accent)}>
                Rolled forward ({mvdPlan.deferred.length}) {expanded ? "▲" : "▼"}
              </Text>
            </Pressable>
          ) : null}
          {expanded
            ? mvdPlan.deferred.map((item) => (
                <Text key={item.id} style={textStyle("bodyS", color.inkMuted)}>
                  {itemLabel(item, tasksById)}
                </Text>
              ))
            : null}

          <Text style={[textStyle("caption", color.inkMuted), styles.protect]}>
            Protect: lights out by {mvdPlan.sleepByTime} · phone away during the study block
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.riskHigh,
    backgroundColor: color.riskHighWash,
    padding: space[5],
    gap: space[1],
  },
  intro: {
    marginTop: space[2],
  },
  section: {
    marginTop: space[4],
    gap: 2,
  },
  disclosure: {
    marginTop: space[3],
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  protect: {
    marginTop: space[3],
  },
});
