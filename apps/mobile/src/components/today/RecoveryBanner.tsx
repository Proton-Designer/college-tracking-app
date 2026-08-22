import type { CalendarEvent, Task } from "@collegeos/api";
import type { MvdCandidateItem, MvdPlan, RecoveryModeResult } from "@collegeos/core";
import { color, radius, shadow, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { GlassSurface } from "../ui";

const EVENT_ID_PREFIX = "event-";

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

function itemLabel(item: MvdCandidateItem, tasksById: Map<number, Task>, eventsById: Map<number, CalendarEvent>): string {
  if (item.id.startsWith(EVENT_ID_PREFIX)) {
    const eventId = Number(item.id.slice(EVENT_ID_PREFIX.length));
    return eventsById.get(eventId)?.title ?? KIND_LABEL[item.kind];
  }
  const task = tasksById.get(Number(item.id));
  return task?.title ?? KIND_LABEL[item.kind];
}

/** §2 -- glass-base, the same tier as a Panel, but with `riskHigh` standing in for the
 *  neutral tint's identity: this is a real alert, and washing it out to the same white glass
 *  every other card uses would lose the one thing this surface exists to signal. The tint is
 *  painted as an ordinary background on GlassSurface's own content wrapper (not a separate
 *  absolutely-positioned overlay), so it sits behind its own children the normal way -- no
 *  extra position/zIndex bookkeeping needed, per the stacking lesson from FOLLOWUPS/§2.2. */
function tintWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

export function RecoveryBanner({
  recoveryMode,
  mvdPlan,
  todayTasks,
  calendarEvents,
}: {
  recoveryMode: RecoveryModeResult;
  mvdPlan: MvdPlan | null;
  todayTasks: Task[];
  calendarEvents: CalendarEvent[];
}) {
  const [expanded, setExpanded] = useState(false);
  const tasksById = new Map(todayTasks.map((t) => [t.id, t]));
  const eventsById = new Map(calendarEvents.map((e) => [e.id, e]));
  const activeSignals = recoveryMode.signals.filter((s) => s.active);

  return (
    <View style={styles.shadowWrap}>
      <GlassSurface
        tier="base"
        style={[styles.clip, { borderColor: color.riskHigh, borderTopColor: color.riskHigh }]}
        contentStyle={[styles.content, { backgroundColor: tintWithAlpha(color.riskHigh, 0.12) }]}
      >
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
                {itemLabel(item, tasksById, eventsById)}
              </Text>
            ))}

            {mvdPlan.deferred.length > 0 ? (
              <Pressable
                onPress={() => setExpanded((v) => !v)}
                style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Text style={textStyle("label", color.accent)}>
                  Rolled forward ({mvdPlan.deferred.length}) {expanded ? "▲" : "▼"}
                </Text>
              </Pressable>
            ) : null}
            {expanded
              ? mvdPlan.deferred.map((item) => (
                  <Text key={item.id} style={textStyle("bodyS", color.inkMuted)}>
                    {itemLabel(item, tasksById, eventsById)}
                  </Text>
                ))
              : null}

            <Text style={[textStyle("caption", color.inkMuted), styles.protect]}>
              Protect: lights out by {mvdPlan.sleepByTime} · phone away during the study block
            </Text>
          </View>
        ) : null}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.lg,
    ...shadow.glass,
  },
  clip: {
    borderRadius: radius.lg,
  },
  content: {
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
