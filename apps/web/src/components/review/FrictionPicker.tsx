"use client";

import type { FrictionCause, Task } from "@collegeos/api";
import { useState, useTransition } from "react";
import { ChipGroup } from "@/components/ui";
import { logFrictionForTask } from "@/app/review/actions";

const FRICTION_OPTIONS: Array<{ value: FrictionCause; label: string }> = [
  { value: "underestimated_duration", label: "Underestimated duration" },
  { value: "unclear_next_action", label: "Didn't know next step" },
  { value: "distracted", label: "Distracted" },
  { value: "tired", label: "Tired" },
  { value: "schedule_changed", label: "Schedule changed" },
  { value: "avoided_task", label: "Avoided discomfort" },
  { value: "higher_priority_appeared", label: "Higher priority appeared" },
  { value: "other", label: "Other" },
];

/** One-tap per incomplete MIT — logged immediately on tap (§3: "structured failure reasons
 *  ... as one-tap chips"), independent of whether the reflection form below it ever submits. */
export function FrictionPicker({ task }: { task: Task }) {
  const [selected, setSelected] = useState<FrictionCause | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(value: string) {
    const cause = value as FrictionCause;
    setSelected(cause);
    setError(null);
    startTransition(async () => {
      const result = await logFrictionForTask(task.id, cause);
      if (!result.ok) {
        setSelected(null);
        setError(result.error ?? "Couldn't save — try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-b-0 last:pb-0">
      <span className="text-body-s text-ink">{task.title}</span>
      <ChipGroup label="Why?" options={FRICTION_OPTIONS} value={selected} onChange={handleSelect} disabled={isPending} />
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </div>
  );
}
