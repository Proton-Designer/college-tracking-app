"use client";

import type { Confidence } from "@collegeos/core";
import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { toggleTaskCompletion } from "@/app/(app)/today/actions";

export interface MitItem {
  taskId: number;
  rank: number;
  title: string;
  courseCode: string | null;
  completed: boolean;
  calibratedMinutes: number;
  calibrationConfidence: Confidence;
}

/** DESIGN_SYSTEM §6.2: line style encodes epistemic status. `low`/`insufficient` both read as
 *  "hypothesis" here — there's no fourth visual tier, and both mean the calibration data is too
 *  thin to trust as more than a guess. */
const CONFIDENCE_BORDER: Record<Confidence, string> = {
  high: "border-solid",
  moderate: "border-dashed",
  low: "border-dotted",
  insufficient: "border-dotted",
};

export interface MitListProps {
  items: MitItem[];
  /**
   * Controlled mode: a parent that needs to read the same completion state elsewhere (e.g.
   * /today's headline, which names the top outstanding MIT and states how many are done --
   * see MitFocus.tsx) owns the state and passes it in, so this list and that other reader can
   * never disagree. `onToggle` replaces the built-in mutation entirely when provided; omit all
   * three controlled props for a self-contained list (Recovery's "Today's minimum" usage).
   */
  onToggle?: (taskId: number, checked: boolean) => void;
  failedIds?: Set<number>;
  isPending?: boolean;
}

export function MitList({ items, onToggle, failedIds: controlledFailedIds, isPending: controlledIsPending }: MitListProps) {
  const isControlled = onToggle !== undefined;

  // Uncontrolled mode only: a per-task optimistic override, keyed by taskId rather than a
  // wholesale re-derived Set, so it never needs to reconcile against a changed `items` array.
  const [localOverrides, setLocalOverrides] = useState<Map<number, boolean>>(new Map());
  const [localFailedIds, setLocalFailedIds] = useState<Set<number>>(new Set());
  const [localIsPending, startTransition] = useTransition();

  const failedIds = controlledFailedIds ?? localFailedIds;
  const isPending = controlledIsPending ?? localIsPending;

  function isChecked(item: MitItem): boolean {
    return isControlled ? item.completed : (localOverrides.get(item.taskId) ?? item.completed);
  }

  function handleToggle(taskId: number, checked: boolean) {
    if (onToggle) {
      onToggle(taskId, checked);
      return;
    }

    setLocalOverrides((prev) => new Map(prev).set(taskId, checked));
    setLocalFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    startTransition(async () => {
      const result = await toggleTaskCompletion(taskId, checked ? "completed" : "pending");
      if (!result.ok) {
        setLocalOverrides((prev) => new Map(prev).set(taskId, !checked));
        setLocalFailedIds((prev) => new Set(prev).add(taskId));
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-body text-ink-muted">No MITs selected for today.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const completed = isChecked(item);
        const failed = failedIds.has(item.taskId);
        return (
          <li
            key={item.taskId}
            className={`flex flex-col gap-1 border-l-2 py-0.5 pl-3 ${CONFIDENCE_BORDER[item.calibrationConfidence]}`}
            style={{ borderColor: "var(--color-ink-muted)" }}
          >
            <Checkbox
              label={item.title}
              checked={completed}
              disabled={isPending && !failed}
              onChange={(checked) => handleToggle(item.taskId, checked)}
              error={failed ? "Couldn't save — check your connection and try again." : undefined}
            />
            <div className="ml-[30px] flex items-center gap-3 font-mono text-caption text-ink-faint">
              {item.courseCode ? <span>{item.courseCode}</span> : null}
              <span>~{Math.round(item.calibratedMinutes)} min</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
