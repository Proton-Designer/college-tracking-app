import type { CalendarEvent, Task, TaskSession } from "@collegeos/api";

// The signature element, DESIGN_SYSTEM §6.1: the day rendered as a chart-recorder trace — a
// ghost line for what was planned, a solid line for what actually happened, shaded where they
// diverge, with a live cursor at the current time. Calendar events (classes, fixed commitments)
// carry no actual/planned distinction in the schema — there's no "did you attend" signal to
// observe — so they render identically in both the planned and actual layer rather than being
// guessed at either way. Task sessions are the real planned-vs-actual data: that's what this
// table exists to record.

const VIEW_W = 1000;
const VIEW_H = 96;
const BAND_Y = 30;
const BAND_H = 34;
const INSET_MIN = 6 * 60;
const INSET_MAX = 22 * 60;

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

interface DeviationSegment extends Interval {
  kind: "missed" | "extra";
}

/** Sweeps both interval sets together and reports every stretch where they disagree. */
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

  const calendarPlanned: Interval[] = calendarEvents.map((e) => ({
    startMin: minutesInZone(new Date(e.start_at), timezone),
    endMin: minutesInZone(new Date(e.end_at), timezone),
  }));

  const sessionPlanned: Interval[] = taskSessions.map((s) => {
    const start = minutesInZone(new Date(s.planned_start), timezone);
    return { startMin: start, endMin: start + s.planned_duration_min };
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
    const plannedEnd = start + s.planned_duration_min;
    return s.actual_start == null && plannedEnd <= nowMin;
  });

  const allMinutes = [
    ...calendarPlanned.flatMap((iv) => [iv.startMin, iv.endMin]),
    ...sessionPlanned.flatMap((iv) => [iv.startMin, iv.endMin]),
    ...sessionActual.flatMap((iv) => [iv.startMin, iv.endMin]),
    nowMin,
  ];
  const dayStart = Math.max(0, Math.min(INSET_MIN, ...(allMinutes.length ? [Math.floor(Math.min(...allMinutes) / 60) * 60] : [])));
  const dayEnd = Math.min(24 * 60, Math.max(INSET_MAX, ...(allMinutes.length ? [Math.ceil(Math.max(...allMinutes) / 60) * 60] : [])));
  const range = dayEnd - dayStart;

  function x(min: number): number {
    return ((Math.min(Math.max(min, dayStart), dayEnd) - dayStart) / range) * VIEW_W;
  }

  const plannedMerged = mergeIntervals([...calendarPlanned, ...sessionPlanned]);
  const actualMerged = mergeIntervals([...calendarPlanned, ...sessionActual]);
  const deviations = findDeviations(plannedMerged, actualMerged, nowMin);

  const hourTicks: number[] = [];
  for (let h = Math.ceil(dayStart / 60); h <= Math.floor(dayEnd / 60); h += Math.max(1, Math.round(range / 60 / 7))) {
    hourTicks.push(h * 60);
  }

  function formatHour(min: number): string {
    const h = Math.floor(min / 60);
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}${h >= 12 ? "PM" : "AM"}`;
  }

  const hasAnyData = calendarEvents.length > 0 || taskSessions.length > 0;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`));

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">
        <span>{weekday} · planned vs. actual</span>
        <span>
          {formatHour(dayStart)} – {formatHour(dayEnd)}
        </span>
      </div>

      <div
        className="day-trace-draw-in"
        role="img"
        aria-label={
          hasAnyData
            ? `Today's plan compared to what has actually happened so far, as of ${formatHour(nowMin)}.${
                missedSessions.length > 0
                  ? ` Missed: ${missedSessions.map((s) => tasksById.get(s.task_id)?.title ?? "a planned session").join(", ")}.`
                  : ""
              }`
            : "Nothing scheduled yet today."
        }
      >
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" aria-hidden>
          {hourTicks.map((min) => (
            <line
              key={min}
              x1={x(min)}
              x2={x(min)}
              y1={BAND_Y - 4}
              y2={BAND_Y + BAND_H + 4}
              stroke="var(--color-hairline)"
              strokeWidth={1}
            />
          ))}

          {plannedMerged.map((iv, i) => (
            <rect
              key={`p-${i}`}
              x={x(iv.startMin)}
              y={BAND_Y}
              width={Math.max(1, x(iv.endMin) - x(iv.startMin))}
              height={BAND_H}
              rx={3}
              fill="none"
              stroke="var(--color-ink-faint)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          ))}

          {deviations.map((d, i) => (
            <rect
              key={`d-${i}`}
              x={x(d.startMin)}
              y={BAND_Y}
              width={Math.max(1, x(d.endMin) - x(d.startMin))}
              height={BAND_H}
              fill={d.kind === "missed" ? "var(--color-risk-high-wash)" : "var(--color-accent-wash)"}
            />
          ))}

          {actualMerged.map((iv, i) => (
            <rect
              key={`a-${i}`}
              x={x(iv.startMin)}
              y={BAND_Y}
              width={Math.max(1, x(iv.endMin) - x(iv.startMin))}
              height={BAND_H}
              rx={3}
              fill="var(--color-accent)"
            />
          ))}

          {missedSessions.map((s, i) => {
            const start = minutesInZone(new Date(s.planned_start), timezone);
            const end = start + s.planned_duration_min;
            return (
              <line
                key={`m-${i}`}
                x1={x(start)}
                x2={x(end)}
                y1={BAND_Y + BAND_H / 2}
                y2={BAND_Y + BAND_H / 2}
                stroke="var(--color-risk-high)"
                strokeWidth={1.5}
              />
            );
          })}

          {nowMin >= dayStart && nowMin <= dayEnd ? (
            <line
              x1={x(nowMin)}
              x2={x(nowMin)}
              y1={BAND_Y - 8}
              y2={BAND_Y + BAND_H + 8}
              stroke="var(--color-accent)"
              strokeWidth={2}
            />
          ) : null}

          {hourTicks.map((min, i) => (
            <text
              key={`t-${min}`}
              x={x(min)}
              y={BAND_Y + BAND_H + 22}
              textAnchor={i === 0 ? "start" : i === hourTicks.length - 1 ? "end" : "middle"}
              className="fill-ink-faint font-mono text-[11px]"
            >
              {formatHour(min)}
            </text>
          ))}
        </svg>
      </div>

      {missedSessions.length > 0 ? (
        <p className="mt-1 font-mono text-caption text-risk-high">
          Didn&apos;t happen: {missedSessions.map((s) => tasksById.get(s.task_id)?.title ?? "a planned session").join(", ")}
        </p>
      ) : !hasAnyData ? (
        <p className="mt-1 font-mono text-caption text-ink-faint">Nothing scheduled yet today.</p>
      ) : null}
    </div>
  );
}
