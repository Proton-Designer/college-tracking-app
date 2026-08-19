import type { CalendarEvent, Task, TaskSession } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

// The signature element, DESIGN_SYSTEM §6.1 — ported from web's DayTrace with identical
// semantics (same merge-free, per-item planned/actual logic, same late-start/missed
// detection), rebuilt with Views instead of SVG since react-native-svg isn't a dependency.
// The two-row PLAN/ACT grammar survives the ~72px mobile budget deliberately: labels move
// to a 2-line stacked column (narrower than "Planned"/"Actual" would need) rather than
// collapsing to one row, per the Lead's explicit instruction not to silently drop a row.

const ROW_H = 22;
const ROW_GAP = 8;
const PLANNED_TOP = 0;
const ACTUAL_TOP = ROW_H + ROW_GAP;
const TIMELINE_H = ACTUAL_TOP + ROW_H;
const INSET_MIN = 6 * 60;
const INSET_MAX = 22 * 60;
const LATE_THRESHOLD_MIN = 5;

interface Interval {
  startMin: number;
  endMin: number;
}

function minutesInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function formatHour(min: number): string {
  const h = Math.floor(min / 60);
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${h >= 12 ? "PM" : "AM"}`;
}

interface PlannedBlock extends Interval {
  missed: boolean;
}

interface LateStart {
  taskId: number;
  plannedStart: number;
  actualStart: number;
  deltaMin: number;
}

interface DeviationSegment extends Interval {
  kind: "missed" | "extra";
}

function mergeIntervals(raw: Interval[]): Interval[] {
  const sorted = [...raw].filter((iv) => iv.endMin > iv.startMin).sort((a, b) => a.startMin - b.startMin);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, iv.endMin);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

export function DayTrace({
  today,
  timezone,
  now,
  calendarEvents,
  taskSessions,
  tasks,
}: {
  today: string;
  timezone: string;
  now: Date;
  calendarEvents: CalendarEvent[];
  taskSessions: TaskSession[];
  tasks: Task[];
}) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const nowMin = minutesInZone(now, timezone);

  const calendarBlocks: Interval[] = calendarEvents.map((e) => ({
    startMin: minutesInZone(new Date(e.start_at), timezone),
    endMin: minutesInZone(new Date(e.end_at), timezone),
  }));

  const calendarActual: Interval[] = calendarBlocks
    .filter((iv) => iv.startMin < nowMin)
    .map((iv) => ({ startMin: iv.startMin, endMin: Math.min(iv.endMin, nowMin) }));

  const sessionPlanned: PlannedBlock[] = taskSessions.map((s) => {
    const start = minutesInZone(new Date(s.planned_start), timezone);
    const end = start + s.planned_duration_min;
    return { startMin: start, endMin: end, missed: s.actual_start == null && end <= nowMin };
  });

  const sessionActual: Interval[] = taskSessions
    .filter((s) => s.actual_start != null)
    .map((s) => {
      const start = minutesInZone(new Date(s.actual_start as string), timezone);
      const end = s.actual_duration_min != null ? start + s.actual_duration_min : Math.max(start, nowMin);
      return { startMin: start, endMin: Math.min(end, nowMin) };
    });

  const missedSessions = taskSessions.filter((s) => {
    const start = minutesInZone(new Date(s.planned_start), timezone);
    return s.actual_start == null && start + s.planned_duration_min <= nowMin;
  });

  const lateStarts: LateStart[] = taskSessions
    .filter((s) => s.actual_start != null)
    .map((s) => {
      const plannedStart = minutesInZone(new Date(s.planned_start), timezone);
      const actualStart = minutesInZone(new Date(s.actual_start as string), timezone);
      return { taskId: s.task_id, plannedStart, actualStart, deltaMin: actualStart - plannedStart };
    })
    .filter((l) => l.deltaMin >= LATE_THRESHOLD_MIN);

  const allMinutes = [
    ...calendarBlocks.flatMap((iv) => [iv.startMin, iv.endMin]),
    ...sessionPlanned.flatMap((iv) => [iv.startMin, iv.endMin]),
    ...sessionActual.flatMap((iv) => [iv.startMin, iv.endMin]),
    nowMin,
  ];
  const dayStart = Math.max(0, Math.min(INSET_MIN, ...(allMinutes.length ? [Math.floor(Math.min(...allMinutes) / 60) * 60] : [])));
  const dayEnd = Math.min(24 * 60, Math.max(INSET_MAX, ...(allMinutes.length ? [Math.ceil(Math.max(...allMinutes) / 60) * 60] : [])));
  const range = dayEnd - dayStart;

  function pct(min: number): number {
    return ((Math.min(Math.max(min, dayStart), dayEnd) - dayStart) / range) * 100;
  }

  const plannedBlocks: PlannedBlock[] = [...calendarBlocks.map((iv) => ({ ...iv, missed: false })), ...sessionPlanned];
  const actualBlocks: Interval[] = [...calendarActual, ...sessionActual];

  const plannedMerged = mergeIntervals(plannedBlocks);
  const actualMerged = mergeIntervals(actualBlocks);
  const deviations = findDeviations(plannedMerged, actualMerged, nowMin);

  const hasAnyData = calendarEvents.length > 0 || taskSessions.length > 0;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`));

  const captionLines = [
    ...missedSessions.map((s) => `Didn't happen: ${tasksById.get(s.task_id)?.title ?? "a planned session"}`),
    ...lateStarts.map((l) => `Started ${l.deltaMin}m late: ${tasksById.get(l.taskId)?.title ?? "a planned session"}`),
  ];

  return (
    <View
      accessible
      accessibilityLabel={
        hasAnyData
          ? `Today's plan compared to what has actually happened so far, as of ${formatHour(nowMin)}.${
              captionLines.length > 0 ? ` ${captionLines.join(". ")}.` : ""
            }`
          : "Nothing scheduled yet today."
      }
    >
      <View style={styles.captionRow}>
        <Text style={textStyle("caption", color.inkFaint)}>{weekday.toUpperCase()} · PLANNED VS. ACTUAL</Text>
        <Text style={textStyle("caption", color.inkFaint)}>
          {formatHour(dayStart)}–{formatHour(dayEnd)}
        </Text>
      </View>

      <View style={styles.chartRow}>
        <View style={styles.labelColumn}>
          <Text style={[textStyle("caption", color.inkFaint), { height: ROW_H, lineHeight: ROW_H }]}>PLAN</Text>
          <View style={{ height: ROW_GAP }} />
          <Text style={[textStyle("caption", color.ink), { height: ROW_H, lineHeight: ROW_H }]}>ACT</Text>
        </View>

        <View style={[styles.timeline, { height: TIMELINE_H }]}>
          {deviations.map((d, i) => (
            <View
              key={`dev-${i}`}
              style={[
                styles.deviation,
                {
                  left: `${pct(d.startMin)}%`,
                  width: `${Math.max(1, pct(d.endMin) - pct(d.startMin))}%`,
                  top: PLANNED_TOP,
                  height: TIMELINE_H,
                  backgroundColor: d.kind === "missed" ? color.riskHighWash : color.accentWash,
                },
              ]}
            />
          ))}

          {plannedBlocks.map((iv, i) => (
            <View
              key={`p-${i}`}
              style={[
                styles.plannedBlock,
                {
                  left: `${pct(iv.startMin)}%`,
                  width: `${Math.max(1, pct(iv.endMin) - pct(iv.startMin))}%`,
                  top: PLANNED_TOP,
                  height: ROW_H,
                  borderColor: iv.missed ? color.riskHigh : color.inkFaint,
                },
              ]}
            />
          ))}

          {actualBlocks.map((iv, i) => (
            <View
              key={`a-${i}`}
              style={[
                styles.actualBlock,
                {
                  left: `${pct(iv.startMin)}%`,
                  width: `${Math.max(1, pct(iv.endMin) - pct(iv.startMin))}%`,
                  top: ACTUAL_TOP,
                  height: ROW_H,
                },
              ]}
            />
          ))}

          {nowMin >= dayStart && nowMin <= dayEnd ? (
            <View style={[styles.cursor, { left: `${pct(nowMin)}%`, height: TIMELINE_H + 12 }]} />
          ) : null}
        </View>
      </View>

      {captionLines.length > 0 ? (
        <View style={styles.captionList}>
          {captionLines.map((line) => (
            <Text key={line} style={textStyle("caption", color.riskHigh)}>
              {line}
            </Text>
          ))}
        </View>
      ) : !hasAnyData ? (
        <Text style={[textStyle("caption", color.inkFaint), styles.emptyCaption]}>Nothing scheduled yet today.</Text>
      ) : null}
    </View>
  );
}

/** Sweeps both interval sets together and reports every stretch where they disagree —
 *  identical logic to web's DayTrace.tsx. */
function findDeviations(planned: Interval[], actual: Interval[], nowMin: number): DeviationSegment[] {
  const boundaries = new Set<number>();
  for (const iv of [...planned, ...actual]) {
    boundaries.add(iv.startMin);
    boundaries.add(iv.endMin);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments: DeviationSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = points[i] as number;
    const segEnd = points[i + 1] as number;
    const mid = (segStart + segEnd) / 2;
    const inPlanned = planned.some((iv) => mid >= iv.startMin && mid < iv.endMin);
    const inActual = actual.some((iv) => mid >= iv.startMin && mid < iv.endMin);
    if (inPlanned && !inActual && segEnd <= nowMin) {
      segments.push({ startMin: segStart, endMin: segEnd, kind: "missed" });
    } else if (!inPlanned && inActual) {
      segments.push({ startMin: segStart, endMin: segEnd, kind: "extra" });
    }
  }
  return segments;
}

const styles = StyleSheet.create({
  captionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space[2],
  },
  chartRow: {
    flexDirection: "row",
    gap: space[3],
  },
  labelColumn: {
    width: 30,
  },
  timeline: {
    flex: 1,
    position: "relative",
  },
  deviation: {
    position: "absolute",
    borderRadius: 3,
  },
  plannedBlock: {
    position: "absolute",
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  actualBlock: {
    position: "absolute",
    borderRadius: 3,
    backgroundColor: color.accent,
  },
  cursor: {
    position: "absolute",
    top: -6,
    width: 2,
    backgroundColor: color.accent,
  },
  captionList: {
    marginTop: space[2],
    gap: space[1],
  },
  emptyCaption: {
    marginTop: space[2],
  },
});
