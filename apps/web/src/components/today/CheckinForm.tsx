"use client";

import type { Course, DayView, Task } from "@collegeos/api";
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

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function CheckinForm({
  today,
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
  const [predictedCompletionPct, setPredictedCompletionPct] = useState(80);
  const [derailment, setDerailment] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setError(null);
    startTransition(async () => {
      const result = await submitCheckin({
        localDate: today,
        energy,
        mood,
        topMitTaskIds: selectedIds,
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
      <div className="flex flex-col gap-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Morning check-in</p>
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
            return (
              <li key={taskId} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2">
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

      <div className="flex flex-col gap-1.5">
        <Label>How much of today will you actually finish?</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={predictedCompletionPct}
            onChange={(e) => setPredictedCompletionPct(Number(e.target.value))}
            className="h-2 w-full accent-[var(--color-accent)]"
          />
          <span className="w-12 shrink-0 text-right font-mono text-body-s tabular-nums text-ink">
            {predictedCompletionPct}%
          </span>
        </div>
      </div>

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
