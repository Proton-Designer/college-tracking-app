"use client";

import type { Task } from "@collegeos/api";
import type { MvdCandidateItem, MvdPlan, RecoveryModeResult } from "@collegeos/core";
import { useState } from "react";

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
    <div className="rounded-lg border border-risk-high bg-risk-high-wash p-5">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-high">
        Recovery Mode active
      </p>
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
                  {itemLabel(item, tasksById)}
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
                  {itemLabel(item, tasksById)}
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
  );
}
