"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_ACTIVE_GOALS, type GoalWithMilestone } from "@collegeos/api";
import { Button, Checkbox, EmptyState, Input, Panel } from "@/components/ui";
import { addGoalAction, retireGoalAction, setMilestoneAction, toggleMilestoneDoneAction } from "@/app/(app)/goals/goalsActions";

export interface GoalsClientProps {
  initialEntries: GoalWithMilestone[];
  month: string;
}

export function GoalsClient({ initialEntries, month }: GoalsClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [reason, setReason] = useState("");
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<number, string>>({});

  function handleAdd() {
    setError(undefined);
    if (title.trim().length === 0) {
      setError("A goal needs a title.");
      return;
    }
    startTransition(async () => {
      const result = await addGoalAction({
        title,
        ...(number.trim().length > 0 ? { number: number.trim() } : {}),
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't add the goal.");
        return;
      }
      setTitle("");
      setNumber("");
      setReason("");
      setAdding(false);
      router.refresh();
    });
  }

  function handleRetire(goalId: number) {
    setError(undefined);
    startTransition(async () => {
      const result = await retireGoalAction(goalId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't retire that goal.");
        return;
      }
      router.refresh();
    });
  }

  function handleSetMilestone(goalId: number) {
    setError(undefined);
    const draft = milestoneDrafts[goalId] ?? "";
    startTransition(async () => {
      const result = await setMilestoneAction(goalId, month, draft);
      if (!result.ok) {
        setError(result.error ?? "Couldn't set that milestone.");
        return;
      }
      setMilestoneDrafts((prev) => ({ ...prev, [goalId]: "" }));
      router.refresh();
    });
  }

  function handleToggleDone(milestoneId: number, done: boolean) {
    setError(undefined);
    startTransition(async () => {
      const result = await toggleMilestoneDoneAction(milestoneId, done);
      if (!result.ok) setError(result.error ?? "Couldn't update that milestone.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      {initialEntries.length === 0 ? (
        <EmptyState
          title="No active goals yet"
          description="Five goals, one milestone each. Add the first one below — the Night Plan pulls from your milestones once they exist."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {initialEntries.map(({ goal, milestone }) => (
            <Panel key={goal.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <p className="text-body-l text-ink">
                    {goal.position}. {goal.title}
                  </p>
                  {goal.number != null || goal.deadline != null ? (
                    <p className="font-mono text-label text-ink-muted">
                      {[goal.number, goal.deadline].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {goal.reason != null ? <p className="text-body-s text-ink-faint">{goal.reason}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleRetire(goal.id)}
                  disabled={isPending}
                  className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint underline underline-offset-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Retire
                </button>
              </div>

              {milestone != null ? (
                <div className="glass-sunken rounded-md p-3">
                  <Checkbox
                    checked={milestone.done}
                    onChange={(done) => handleToggleDone(milestone.id, done)}
                    label={milestone.title}
                    disabled={isPending}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Input
                    label={`Milestone for ${month}`}
                    value={milestoneDrafts[goal.id] ?? ""}
                    onChange={(e) => setMilestoneDrafts((prev) => ({ ...prev, [goal.id]: e.target.value }))}
                    placeholder="The one thing this month"
                  />
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => handleSetMilestone(goal.id)}
                      disabled={isPending || (milestoneDrafts[goal.id] ?? "").trim().length === 0}
                      loading={isPending}
                    >
                      Set milestone
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {adding ? (
        <Panel title="New goal" className="flex flex-col gap-3">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
          <Input
            label="Number (optional)"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="3.8 GPA"
            disabled={isPending}
          />
          <Input
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this matters"
            disabled={isPending}
          />
          <div className="flex gap-3">
            <Button onClick={handleAdd} disabled={isPending || title.trim().length === 0} loading={isPending}>
              Add goal
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </Panel>
      ) : initialEntries.length < MAX_ACTIVE_GOALS ? (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add a goal
          </Button>
        </div>
      ) : (
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          Five goals is the ceiling, on purpose. Retire one before adding another.
        </p>
      )}
    </div>
  );
}
