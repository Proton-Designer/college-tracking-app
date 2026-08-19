import type { CalendarEvent, Task, TaskSession } from "@collegeos/api";

// The signature element, DESIGN_SYSTEM §6.1: the day rendered as a chart-recorder trace — a
// ghost PLANNED row, a solid accent ACTUAL row directly below it so the eye reads the offset
// without saccading, a shaded connector where they diverge, and a live cursor at current time.
// Calendar events (classes, fixed commitments) carry no attendance signal in the schema — there's
// no "did you attend" data to observe either way — so a class is never marked missed; it's
// planned-only until the live cursor reaches it, then reads as matched. Task sessions are the
// real planned-vs-actual signal: that's what planned_start/actual_start exist to record, and late
// starts and no-shows are computed from them specifically, not from the merged block geometry.

const VIEW_W = 1000;
const VIEW_H = 96;
const ROW_H = 24;
const ROW_GAP = 8;
const PLANNED_Y = 6;
const ACTUAL_Y = PLANNED_Y + ROW_H + ROW_GAP;
const CONNECTOR_TOP = PLANNED_Y;
const CONNECTOR_BOTTOM = ACTUAL_Y + ROW_H;
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
  // dayEnd can legitimately clamp to exactly 24:00 (midnight) — normalize back to hour 0 first
  // so that reads as 12AM, not 12PM (h=24 % 12 === 0, same digit as noon, so AM/PM must be
  // decided before the %12 collapses the two together).
  const h = Math.floor(min / 60) % 24;
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

  // Classes carry no attendance signal, so "attended" is never claimed for one that hasn't
  // started yet — it stays planned-only until the live cursor reaches it. One already underway
  // shows solid up to the cursor, not its full length.
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

  function x(min: number): number {
    return ((Math.min(Math.max(min, dayStart), dayEnd) - dayStart) / range) * VIEW_W;
  }

  const plannedBlocks: PlannedBlock[] = [
    ...calendarBlocks.map((iv) => ({ ...iv, missed: false })),
    ...sessionPlanned,
  ];
  const actualBlocks: Interval[] = [...calendarActual, ...sessionActual];

  const hourTicks: number[] = [];
  for (let h = Math.ceil(dayStart / 60); h <= Math.floor(dayEnd / 60); h += Math.max(1, Math.round(range / 60 / 7))) {
    hourTicks.push(h * 60);
  }

  const hasAnyData = calendarEvents.length > 0 || taskSessions.length > 0;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`));

  const captionLines = [
    ...missedSessions.map((s) => `Didn't happen: ${tasksById.get(s.task_id)?.title ?? "a planned session"}`),
    ...lateStarts.map((l) => `Started ${l.deltaMin}m late: ${tasksById.get(l.taskId)?.title ?? "a planned session"}`),
  ];

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between font-mono text-caption uppercase tracking-[0.08em] text-ink-faint">
        <span>{weekday} · planned vs. actual</span>
        <span>
          {formatHour(dayStart)} – {formatHour(dayEnd)}
        </span>
      </div>

      <div
        className="day-trace-draw-in flex gap-3"
        role="img"
        aria-label={
          hasAnyData
            ? `Today's plan compared to what has actually happened so far, as of ${formatHour(nowMin)}.${
                captionLines.length > 0 ? ` ${captionLines.join(". ")}.` : ""
              }`
            : "Nothing scheduled yet today."
        }
      >
        <div className="relative w-14 shrink-0" style={{ height: VIEW_H }}>
          <span
            className="absolute left-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint"
            style={{ top: PLANNED_Y, lineHeight: `${ROW_H}px` }}
          >
            Planned
          </span>
          <span
            className="absolute left-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink"
            style={{ top: ACTUAL_Y, lineHeight: `${ROW_H}px` }}
          >
            Actual
          </span>
        </div>

        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: VIEW_H }}
          aria-hidden
        >
          {hourTicks.map((min) => (
            <line
              key={min}
              x1={x(min)}
              x2={x(min)}
              y1={PLANNED_Y - 4}
              y2={ACTUAL_Y + ROW_H + 4}
              stroke="var(--color-hairline)"
              strokeWidth={1}
            />
          ))}

          {/* Late-start / no-show connectors drawn first, under both rows, so the offset reads
              as a solid band spanning from the planned row down to the actual row. */}
          {lateStarts.map((l, i) => (
            <g key={`late-${i}`}>
              <rect
                x={x(l.plannedStart)}
                y={CONNECTOR_TOP}
                width={Math.max(2, x(l.actualStart) - x(l.plannedStart))}
                height={CONNECTOR_BOTTOM - CONNECTOR_TOP}
                fill="var(--color-risk-high-wash)"
              />
              <line
                x1={x(l.plannedStart)}
                x2={x(l.plannedStart)}
                y1={CONNECTOR_TOP}
                y2={CONNECTOR_BOTTOM}
                stroke="var(--color-risk-high)"
                strokeWidth={2}
              />
              <line
                x1={x(l.actualStart)}
                x2={x(l.actualStart)}
                y1={CONNECTOR_TOP}
                y2={CONNECTOR_BOTTOM}
                stroke="var(--color-risk-high)"
                strokeWidth={2}
              />
            </g>
          ))}

          {plannedBlocks.map((iv, i) => (
            <rect
              key={`p-${i}`}
              x={x(iv.startMin)}
              y={PLANNED_Y}
              width={Math.max(1, x(iv.endMin) - x(iv.startMin))}
              height={ROW_H}
              rx={3}
              fill="none"
              stroke={iv.missed ? "var(--color-risk-high)" : "var(--color-ink-faint)"}
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
          ))}
          {plannedBlocks
            .filter((iv) => iv.missed)
            .map((iv, i) => (
              <line
                key={`miss-${i}`}
                x1={x(iv.startMin)}
                x2={x(iv.endMin)}
                y1={PLANNED_Y + ROW_H / 2}
                y2={PLANNED_Y + ROW_H / 2}
                stroke="var(--color-risk-high)"
                strokeWidth={1.5}
              />
            ))}

          {actualBlocks.map((iv, i) => (
            <rect
              key={`a-${i}`}
              x={x(iv.startMin)}
              y={ACTUAL_Y}
              width={Math.max(1, x(iv.endMin) - x(iv.startMin))}
              height={ROW_H}
              rx={3}
              fill="var(--color-accent)"
            />
          ))}

          {nowMin >= dayStart && nowMin <= dayEnd ? (
            <line
              x1={x(nowMin)}
              x2={x(nowMin)}
              y1={PLANNED_Y - 8}
              y2={ACTUAL_Y + ROW_H + 8}
              stroke="var(--color-accent)"
              strokeWidth={2}
            />
          ) : null}

          {hourTicks.map((min, i) => (
            <text
              key={`t-${min}`}
              x={x(min)}
              y={ACTUAL_Y + ROW_H + 20}
              textAnchor={i === 0 ? "start" : i === hourTicks.length - 1 ? "end" : "middle"}
              className="fill-ink-faint font-mono text-[11px]"
            >
              {formatHour(min)}
            </text>
          ))}
        </svg>
      </div>

      {captionLines.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {captionLines.map((line) => (
            <li key={line} className="font-mono text-caption text-risk-high">
              {line}
            </li>
          ))}
        </ul>
      ) : !hasAnyData ? (
        <p className="mt-1 font-mono text-caption text-ink-faint">Nothing scheduled yet today.</p>
      ) : null}
    </div>
  );
}
