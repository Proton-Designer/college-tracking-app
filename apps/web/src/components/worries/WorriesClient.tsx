"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorryRow } from "@collegeos/api";
import { Button, EmptyState, Input, Panel } from "@/components/ui";
import { addWorryAction, markWorryDoneAction } from "@/app/(app)/worries/worriesActions";

export interface WorriesClientProps {
  initialWorries: WorryRow[];
}

export function WorriesClient({ initialWorries }: WorriesClientProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    setError(undefined);
    if (draft.trim().length === 0) return;
    startTransition(async () => {
      const result = await addWorryAction(draft);
      if (!result.ok) {
        setError(result.error ?? "Could not save that.");
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  function handleDone(worryId: number) {
    setError(undefined);
    startTransition(async () => {
      const result = await markWorryDoneAction(worryId);
      if (!result.ok) {
        setError(result.error ?? "Could not update that.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-3">
        <Input
          label="What's circling?"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="One line, then let it go"
          disabled={isPending}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        <div>
          <Button onClick={handleAdd} loading={isPending} disabled={draft.trim().length === 0}>
            Park it
          </Button>
        </div>
      </Panel>

      {initialWorries.length === 0 ? (
        <EmptyState title="Nothing parked" description="Good. Write one down the moment it circles back." />
      ) : (
        <ul className="flex flex-col gap-2">
          {initialWorries.map((w) => (
            <li key={w.id}>
              <Panel tone="sunken" className="flex flex-row items-center gap-3">
                <p className="flex-1 text-body text-ink">{w.text}</p>
                <button
                  type="button"
                  onClick={() => handleDone(w.id)}
                  disabled={isPending}
                  className="font-sans text-body-s text-ink-muted underline underline-offset-2 outline-none hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Handled
                </button>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
