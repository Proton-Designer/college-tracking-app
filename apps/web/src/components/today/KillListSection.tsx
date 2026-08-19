"use client";

import type { KillEventOutcome, KillHabitRow } from "@collegeos/api";
import { useState, useTransition } from "react";
import { logKillEventForHabit } from "@/app/(app)/today/actions";
import { Button, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * SCREEN_SPEC §1.6 — one tap to log an event. Deliberately NOT color-coded
 * good/bad (no risk-critical red on "gave in"): the brief's bounce-back metric only
 * works if a relapse gets logged as readily as a resist, and a punishing UI is exactly
 * what makes people stop logging the thing that matters most. Both buttons are the same
 * neutral weight; the only asymmetry is which one is tapped.
 */
export function KillListSection({ habits }: { habits: KillHabitRow[] }) {
  if (habits.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Kill list</h2>
      <div className="flex flex-col gap-3">
        {habits.map((habit) => (
          <KillHabitRow key={habit.id} habit={habit} />
        ))}
      </div>
    </section>
  );
}

function KillHabitRow({ habit }: { habit: KillHabitRow }) {
  const toast = useToast();
  const [pending, setPending] = useState<KillEventOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLog(outcome: KillEventOutcome) {
    setPending(outcome);
    startTransition(async () => {
      const result = await logKillEventForHabit(habit.id, outcome);
      setPending(null);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't log that — try again.", "error");
        return;
      }
      toast.show("Logged.");
    });
  }

  return (
    <Panel className="flex items-center justify-between gap-4">
      <span className="text-body text-ink">{habit.name}</span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          loading={isPending && pending === "resisted"}
          disabled={isPending && pending !== "resisted"}
          onClick={() => handleLog("resisted")}
        >
          I resisted
        </Button>
        <Button
          variant="secondary"
          loading={isPending && pending === "relapsed"}
          disabled={isPending && pending !== "relapsed"}
          onClick={() => handleLog("relapsed")}
        >
          I gave in
        </Button>
      </div>
    </Panel>
  );
}
