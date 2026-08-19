"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { toggleTaskCompletion } from "@/app/today/actions";

export interface MitItem {
  taskId: number;
  rank: number;
  title: string;
  courseCode: string | null;
  completed: boolean;
  /**
   * Raw (uncalibrated) estimate from the task row. `packages/api`'s SuggestedMit doesn't carry a
   * calibrated figure yet (tracked, see the L4 report) — showing the raw number labeled as such
   * beats hiding it or pretending it's the corrected one.
   */
  rawEstimatedMinutes: number | null;
}

export function MitList({ items }: { items: MitItem[] }) {
  const [completedIds, setCompletedIds] = useState<Set<number>>(
    () => new Set(items.filter((i) => i.completed).map((i) => i.taskId)),
  );
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  function handleToggle(taskId: number, checked: boolean) {
    // Optimistic: flip immediately, roll back on failure.
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    startTransition(async () => {
      const result = await toggleTaskCompletion(taskId, checked ? "completed" : "pending");
      if (!result.ok) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(taskId);
          else next.add(taskId);
          return next;
        });
        setFailedIds((prev) => new Set(prev).add(taskId));
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-body text-ink-muted">No MITs selected for today.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const completed = completedIds.has(item.taskId);
        const failed = failedIds.has(item.taskId);
        return (
          <li key={item.taskId} className="flex flex-col gap-1">
            <Checkbox
              label={item.title}
              checked={completed}
              disabled={isPending && !failed}
              onChange={(checked) => handleToggle(item.taskId, checked)}
              error={failed ? "Couldn't save — check your connection and try again." : undefined}
            />
            <div className="ml-[30px] flex items-center gap-3 font-mono text-caption text-ink-faint">
              {item.courseCode ? <span>{item.courseCode}</span> : null}
              {item.rawEstimatedMinutes != null ? (
                <span title="Raw estimate — not yet calibration-corrected">
                  ~{item.rawEstimatedMinutes} min
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
