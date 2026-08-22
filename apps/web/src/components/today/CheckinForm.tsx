"use client";

import type { Course, DayView, Task } from "@collegeos/api";
import type { MitTimebox } from "@collegeos/api";
import { localTimeToInstant } from "@collegeos/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, ChipGroup, Label, Panel } from "@/components/ui";
import { submitCheckin } from "@/app/(app)/today/actions";

const DERAILMENT_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "fatigue", label: "Fatigue" },
  { value: "avoidance", label: "Avoidance" },
  { value: "schedule", label: "Schedule" },
  { value: "other", label: "Other" },
];

const COMPLETION_OPTIONS = [0, 20, 40, 60, 80, 100].map((pct) => ({ value: String(pct), label: `${pct}%` }));

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Formats an already-known instant back into an "HH:MM" the <input type="time"> can
 *  display, in the user's own timezone -- presentational, not a domain computation
 *  (localTimeToInstant, the actual local-time -> instant conversion this form submits
 *  through, is the packages/core call that does real work). */
function instantToTimeInputValue(iso: string | null, timezone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

interface TimeboxFieldState {
  time: string; // "HH:MM" or ""
  location: string;
  revealed: boolean;
}

function initialTimeboxState(task: Task | undefined, timezone: string): TimeboxFieldState {
  const time = instantToTimeInputValue(task?.planned_start_at ?? null, timezone);
  const location = task?.planned_location ?? "";
  return { time, location, revealed: time !== "" || location !== "" };
}

export function CheckinForm({
  today,
  timezone,
  todayTasks,
  courses,
  suggestedMits,
  todayHealth,
  workload,
  recoveryMode,
  onDone,
  onSkip,
}: {
  today: string;
  timezone: string;
  todayTasks: Task[];
  courses: Record<number, Course>;
  suggestedMits: DayView["suggestedMits"];
  todayHealth: DayView["todayHealth"];
  workload: DayView["workload"];
  recoveryMode: DayView["recoveryMode"];
  onDone: () => void;
  onSkip: () => void;
}) {
  const router = useRouter();
  const tasksById = new Map(todayTasks.map((t) => [t.id, t]));
  const availableTasks = todayTasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");

  const [selectedIds, setSelectedIds] = useState<number[]>(() => suggestedMits.map((m) => m.taskId).slice(0, 3));
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  // No default: a completion prediction is a claim about work, and a pre-set value that
  // submits unchanged is indistinguishable from a real answer. null (never answered) is
  // only allowed to reach submit when there are no MITs to predict against at all.
  const [predictedCompletionPct, setPredictedCompletionPct] = useState<number | null>(null);
  const [derailment, setDerailment] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [timeboxes, setTimeboxes] = useState<Record<number, TimeboxFieldState>>({});

  function timeboxFor(taskId: number): TimeboxFieldState {
    return timeboxes[taskId] ?? initialTimeboxState(tasksById.get(taskId), timezone);
  }

  function updateTimebox(taskId: number, patch: Partial<TimeboxFieldState>) {
    setTimeboxes((prev) => ({ ...prev, [taskId]: { ...timeboxFor(taskId), ...patch } }));
  }

  const remainingTasks = availableTasks.filter((t) => !selectedIds.includes(t.id));

  function removeMit(taskId: number) {
    setSelectedIds((prev) => prev.filter((id) => id !== taskId));
  }

  function addMit(taskId: number) {
    setSelectedIds((prev) => (prev.length >= 3 ? prev : [...prev, taskId]));
    setSwapTarget("");
  }

  function handleSubmit() {
    if (energy == null || mood == null) {
      setError("Energy and mood are required.");
      return;
    }
    if (selectedIds.length > 0 && predictedCompletionPct == null) {
      setError("Pick how much of today you'll actually finish.");
      return;
    }
    setError(null);

    // Every selected MIT gets a real entry -- for an untouched task this just resolves
    // to whatever it already had (initialTimeboxState mirrors the existing DB value), so
    // this is never a silent clear. A real "HH:MM" is converted to a real UTC instant via
    // packages/core's localTimeToInstant -- the UI never does that conversion itself.
    const mitTimeboxes: Record<number, MitTimebox> = {};
    for (const taskId of selectedIds) {
      const box = timeboxFor(taskId);
      const [hourStr, minuteStr] = box.time.split(":");
      mitTimeboxes[taskId] = {
        plannedStartAt: box.time && hourStr && minuteStr ? localTimeToInstant(today, Number(hourStr), Number(minuteStr), timezone) : null,
        plannedLocation: box.location.trim() || null,
      };
    }

    startTransition(async () => {
      const result = await submitCheckin({
        localDate: today,
        energy,
        mood,
        topMitTaskIds: selectedIds,
        mitTimeboxes,
        predictedCompletionPct,
        capacityMinutes: workload.capacityMinutes,
        floorMinutes: workload.floorMinutes,
        targetMinutes: workload.targetMinutes,
        recoveryModeTriggered: recoveryMode.triggered,
        recoveryModeTotal: recoveryMode.total,
        ...(derailment ? { derailmentReason: derailment, likelyFailureMode: derailment } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save — try again.");
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <Panel className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
      {/* §8: an unplanned day's lead statement is the invitation to plan it -- there's no
          computed value to name yet, since that's exactly what this form is about to produce. */}
      <div className="flex flex-col gap-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Morning check-in</p>
        <h1 className="font-sans text-display-l font-semibold tracking-[-0.025em] text-ink">Plan today</h1>
        <p className="text-body-s text-ink-faint">About 60 seconds. Pre-filled — you&apos;re mostly correcting, not typing.</p>
      </div>

      {todayHealth?.sleepHours != null || todayHealth?.whoopRecoveryPct != null ? (
        <p className="font-mono text-body-s tabular-nums text-ink-muted">
          {[
            todayHealth?.sleepHours != null ? `Slept ${formatSleep(todayHealth.sleepHours)}` : null,
            todayHealth?.whoopRecoveryPct != null ? `Recovery ${Math.round(todayHealth.whoopRecoveryPct)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <SimpleScale label="Energy" value={energy} onChange={setEnergy} />
      <SimpleScale label="Mood" value={mood} onChange={setMood} />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Top 3 for today</Label>
          {selectedIds.length === 0 ? (
            <button
              type="button"
              onClick={() => setSelectedIds(suggestedMits.map((m) => m.taskId).slice(0, 3))}
              className="font-mono text-caption uppercase tracking-[0.08em] text-accent underline underline-offset-2"
            >
              Accept all
            </button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-1.5">
          {selectedIds.map((taskId) => {
            const task = tasksById.get(taskId);
            const course = task?.course_id != null ? courses[task.course_id] : undefined;
            const box = timeboxFor(taskId);
            return (
              <li key={taskId} className="flex flex-col gap-2 rounded-sm border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-body-s text-ink">{task?.title ?? "Untitled task"}</span>
                    {course ? <span className="font-mono text-caption text-ink-faint">{course.code}</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMit(taskId)}
                    className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
                  >
                    Remove
                  </button>
                </div>

                {box.revealed ? (
                  <div className="flex items-center gap-2 pl-0.5">
                    <input
                      type="time"
                      aria-label={`When for ${task?.title ?? "this task"}`}
                      value={box.time}
                      onChange={(e) => updateTimebox(taskId, { time: e.target.value })}
                      className="h-8 rounded-sm border border-border bg-surface px-2 font-mono text-caption tabular-nums text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                    />
                    <input
                      type="text"
                      aria-label={`Where for ${task?.title ?? "this task"}`}
                      placeholder="Where? (optional)"
                      value={box.location}
                      onChange={(e) => updateTimebox(taskId, { location: e.target.value })}
                      className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 font-sans text-body-s text-ink outline-none placeholder:text-ink-faint focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                    />
                    {box.time === "" && box.location === "" ? (
                      <button
                        type="button"
                        onClick={() => updateTimebox(taskId, { revealed: false })}
                        className="shrink-0 font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateTimebox(taskId, { revealed: true })}
                    className="self-start font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
                  >
                    + Add time
                  </button>
                )}
              </li>
            );
          })}
          {selectedIds.length === 0 ? <p className="text-body-s text-ink-faint">Nothing selected.</p> : null}
        </ul>
        {selectedIds.length < 3 && remainingTasks.length > 0 ? (
          <select
            value={swapTarget}
            onChange={(e) => addMit(Number(e.target.value))}
            className="h-9 rounded-sm border border-border bg-surface px-2 font-sans text-body-s text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
          >
            <option value="" disabled>
              Add a task…
            </option>
            {remainingTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {selectedIds.length > 0 ? (
        <ChipGroup
          label="How much of today will you actually finish?"
          options={COMPLETION_OPTIONS}
          value={predictedCompletionPct != null ? String(predictedCompletionPct) : null}
          onChange={(v) => setPredictedCompletionPct(Number(v))}
        />
      ) : null}

      <ChipGroup label="Most likely to derail you" options={DERAILMENT_OPTIONS} value={derailment} onChange={setDerailment} />

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={onSkip}
          className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink"
        >
          Skip for today
        </button>
        <Button onClick={handleSubmit} loading={isPending}>
          Start the day
        </Button>
      </div>
    </Panel>
  );
}

function SimpleScale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} (1–10)</Label>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((cell) => {
          const selected = value === cell;
          return (
            <button
              key={cell}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(cell)}
              className={`flex h-9 flex-1 items-center justify-center rounded-sm border font-mono text-body-s tabular-nums outline-none transition-colors duration-90 focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 ${
                selected ? "border-accent bg-accent text-white" : "border-border bg-surface-sunken text-ink hover:bg-surface"
              }`}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}
