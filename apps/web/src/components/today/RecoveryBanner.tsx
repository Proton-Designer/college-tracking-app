"use client";

import type { CalendarEvent, Task } from "@collegeos/api";
import type { MvdCandidateItem, MvdPlan, RecoveryModeResult } from "@collegeos/core";
import { color } from "@collegeos/design";
import { useState } from "react";
import { tintWithAlpha } from "@/lib/colorAlpha";

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
    // §2: same tier and two-edge treatment as every other card -- a hard riskHigh border was
    // the v1 idiom this component started with (Nova hit and fixed the identical mistake on
    // mobile first). Alert identity lives in the eyebrow color plus a low-alpha riskHigh tint
    // layered on top of the neutral glass, not a border override or an opaque fill. Same
    // numbers as mobile's RecoveryBanner: 0.07 alpha, not re-derived.
    <div className="glass overflow-hidden rounded-lg">
      <div className="p-5" style={{ backgroundColor: tintWithAlpha(color.riskHigh, 0.07) }}>
      {/* §8's lead statement moved to the page header (TodayPage, next to the normal-mode
       *  headline) -- it wasn't leading two-thirds down the page inside this card. This label
       *  stays as the card's own status marker; the detail (why, what's kept, what's rolled
       *  forward) is still this component's job. */}
      <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-high">Recovery mode active</p>
      <p className="mt-2 text-body text-ink">
        Today is scaled down to the minimum viable day. Nothing that doesn&apos;t fit is dropped —
        it&apos;s rolled forward, and you can see exactly what.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Why</span>
        <ul className="flex flex-col gap-0.5">
          {activeSignals.map((signal) => (
            <li key={signal.key} className="text-body-s text-ink-muted">
              {SIGNAL_LABEL[signal.key] ?? signal.key}
            </li>
          ))}
        </ul>
      </div>

      {mvdPlan ? (
        <div className="mt-4">
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase tracking-[0.1em] text-ink-muted">Kept today</span>
            <ul className="flex flex-col gap-0.5">
              {mvdPlan.kept.map((item) => (
                <li key={item.id} className="text-body-s text-ink">
                  {itemLabel(item, tasksById, eventsById)}
                </li>
              ))}
            </ul>
          </div>

          {mvdPlan.deferred.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 font-mono text-label uppercase tracking-[0.1em] text-accent underline underline-offset-2 outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
            >
              Rolled forward ({mvdPlan.deferred.length}) {expanded ? "▲" : "▼"}
            </button>
          ) : null}
          {expanded ? (
            <ul className="mt-2 flex flex-col gap-0.5">
              {mvdPlan.deferred.map((item) => (
                <li key={item.id} className="text-body-s text-ink-muted">
                  {itemLabel(item, tasksById, eventsById)}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-3 font-mono text-caption text-ink-muted">
            Protect: lights out by {mvdPlan.sleepByTime} · phone away during the study block
          </p>
        </div>
      ) : null}
      </div>
    </div>
  );
}
