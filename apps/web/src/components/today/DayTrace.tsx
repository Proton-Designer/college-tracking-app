"use client";

import { useEffect, useRef, useState } from "react";

export interface DayTraceBlock {
  label: string;
  startMinutes: number;
  endMinutes: number;
}

export interface DayTraceProps {
  /** Minutes since midnight, local time. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  nowMinutes: number;
  planned: DayTraceBlock[];
  actual: DayTraceBlock[];
}

const ROW_H = 22;
const PLANNED_Y = 30;
const ACTUAL_Y = PLANNED_Y + ROW_H + 4;
const SVG_H = 92;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = () => setReduced(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/**
 * The signature element (DESIGN_SYSTEM §6.1) — planned (ghost/dashed) vs actual (solid accent),
 * a live cursor at the current time, drawing in left-to-right on load. Built once, deliberately,
 * for Today. Renders an honest empty state until real `task_sessions`/`calendar_events` data
 * flows in — see the L4 report for the DayView gap this is waiting on.
 */
export function DayTrace({ dayStartMinutes, dayEndMinutes, nowMinutes, planned, actual }: DayTraceProps) {
  const reducedMotion = useReducedMotion();
  const range = dayEndMinutes - dayStartMinutes;
  const [drawn, setDrawn] = useState(reducedMotion);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    const start = performance.now();
    const duration = 380;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / duration);
      setDrawn(progress >= 1);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // Re-draw whenever the underlying data changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, planned.length, actual.length]);

  const pct = (min: number) => ((min - dayStartMinutes) / range) * 100 * 10;
  const nowPct = Math.min(100, Math.max(0, ((nowMinutes - dayStartMinutes) / range) * 100)) * 10;
  const hasData = planned.length > 0 || actual.length > 0;

  if (!hasData) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-hairline bg-surface">
        <p className="font-mono text-caption text-ink-faint">
          No planned or logged time yet today — the trace fills in as the day happens.
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden rounded-lg border border-hairline bg-surface p-4"
      role="img"
      aria-label="Today's chart-recorder trace: planned schedule versus what has actually happened so far."
    >
      <svg viewBox={`0 0 1000 ${SVG_H}`} className="w-full" aria-hidden>
        <text x={0} y={PLANNED_Y + 15} className="fill-ink-faint font-mono text-[11px] uppercase tracking-[0.08em]">
          Planned
        </text>
        {planned.map((b) => (
          <rect
            key={`p-${b.label}-${b.startMinutes}`}
            x={pct(b.startMinutes)}
            y={PLANNED_Y}
            width={drawn ? pct(b.endMinutes) - pct(b.startMinutes) : 0}
            height={ROW_H}
            rx={3}
            fill="none"
            stroke="var(--color-ink-faint)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            style={{ transition: reducedMotion ? undefined : "width 380ms cubic-bezier(0.2,0,0,1)" }}
          />
        ))}

        <text x={0} y={ACTUAL_Y + 15} className="fill-ink font-mono text-[11px] uppercase tracking-[0.08em]">
          Actual
        </text>
        {actual.map((b) => (
          <rect
            key={`a-${b.label}-${b.startMinutes}`}
            x={pct(b.startMinutes)}
            y={ACTUAL_Y}
            width={drawn ? pct(b.endMinutes) - pct(b.startMinutes) : 0}
            height={ROW_H}
            rx={3}
            fill="var(--color-accent)"
            style={{ transition: reducedMotion ? undefined : "width 380ms cubic-bezier(0.2,0,0,1)" }}
          />
        ))}

        {nowMinutes >= dayStartMinutes && nowMinutes <= dayEndMinutes ? (
          <line
            x1={nowPct}
            x2={nowPct}
            y1={PLANNED_Y - 8}
            y2={ACTUAL_Y + ROW_H + 8}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
          />
        ) : null}
      </svg>
    </div>
  );
}
