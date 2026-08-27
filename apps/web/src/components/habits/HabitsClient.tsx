"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Input, Panel } from "@/components/ui";
import { addHabitAction, setHabitPausedAction, voteAction } from "@/app/(app)/habits/habitsActions";
import type { HabitState } from "@/app/(app)/habits/page";

/** A score is only rendered once this many scheduled days have been observed. Below it the
 *  number is noise dressed as judgment -- mirrors apps/mobile/src/app/habits.tsx exactly. */
const MIN_DAYS_TO_JUDGE = 7;

export interface HabitsClientProps {
  initialStates: HabitState[];
}

export function HabitsClient({ initialStates }: HabitsClientProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleVote(state: HabitState) {
    setError(undefined);
    // Tap casts the vote; tapping an already-cast vote retracts it to an explicit "not
    // today" rather than deleting the row -- silence and "no" are different answers.
    const next = state.todayVote !== true;
    startTransition(async () => {
      const result = await voteAction(state.habit.id, next);
      if (!result.ok) {
        setError(result.error ?? "Could not record the vote.");
        return;
      }
      router.refresh();
    });
  }

  function handleAdd() {
    setError(undefined);
    startTransition(async () => {
      const result = await addHabitAction(name, identity);
      if (!result.ok) {
        setError(result.error ?? "Could not add the habit.");
        return;
      }
      setName("");
      setIdentity("");
      setAdding(false);
      router.refresh();
    });
  }

  function handleTogglePause(state: HabitState) {
    setError(undefined);
    startTransition(async () => {
      const result = await setHabitPausedAction(state.habit.id, !state.habit.paused);
      if (!result.ok) {
        setError(result.error ?? "Could not update the habit.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      {initialStates.length === 0 ? (
        <EmptyState
          title="No habits yet"
          description="Each one is a small, repeated vote for an identity. Add the first."
        />
      ) : (
        initialStates.map((state) => {
          const voted = state.todayVote === true;
          return (
            <Panel key={state.habit.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-body-l text-ink">{state.habit.name}</p>
                  <p className="text-body-s text-ink-muted">
                    {state.votes} vote{state.votes === 1 ? "" : "s"} for {state.habit.identity}
                  </p>
                </div>
                <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                  {state.habit.paused
                    ? "Paused"
                    : state.observedDays >= MIN_DAYS_TO_JUDGE
                      ? Math.round(state.score)
                      : "New"}
                </span>
              </div>

              {!state.habit.paused && state.observedDays >= MIN_DAYS_TO_JUDGE ? (
                <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                  <div
                    className="h-full rounded-pill bg-accent"
                    style={{ width: `${Math.max(2, Math.min(100, state.score))}%` }}
                  />
                </div>
              ) : null}

              {state.habit.why_card != null ? (
                <p className="mt-2 text-body-s text-ink-muted">{state.habit.why_card}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {state.habit.paused ? (
                  <Button variant="secondary" onClick={() => handleTogglePause(state)} disabled={isPending}>
                    Resume
                  </Button>
                ) : (
                  <Button
                    variant={voted ? "secondary" : "primary"}
                    onClick={() => handleVote(state)}
                    disabled={isPending}
                  >
                    {voted ? `Voted · ${state.habit.identity} ✓` : `Vote for ${state.habit.identity}`}
                  </Button>
                )}
                {!state.habit.paused ? (
                  <button
                    type="button"
                    onClick={() => handleTogglePause(state)}
                    disabled={isPending}
                    className="font-sans text-body-s text-ink-muted underline underline-offset-2 outline-none hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Pause (travel, sick — score freezes)
                  </button>
                ) : null}
              </div>
            </Panel>
          );
        })
      )}

      {adding ? (
        <Panel title="New habit" className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Train" disabled={isPending} />
          <Input
            label="Identity"
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder="the athlete"
            disabled={isPending}
          />
          <div className="flex gap-3">
            <Button onClick={handleAdd} loading={isPending} disabled={name.trim().length === 0 || identity.trim().length === 0}>
              Add habit
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </Panel>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add a habit
          </Button>
        </div>
      )}
    </div>
  );
}
