"use client";

import type { LlmMonthlySpend, Profile } from "@collegeos/api";
import { useState, useTransition } from "react";
import { updateLlmBudget } from "@/app/(app)/settings/actions";
import { Button, FieldError, Input, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

export function LlmBudgetSection({
  profile,
  monthlySpend,
  hasEverCalledModel,
}: {
  profile: Profile;
  monthlySpend: LlmMonthlySpend;
  hasEverCalledModel: boolean;
}) {
  const toast = useToast();
  const [budget, setBudget] = useState(String(profile.llm_monthly_budget_usd));
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(undefined);
    const parsed = Number(budget);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Monthly budget must be a positive number.");
      return;
    }
    startTransition(async () => {
      const result = await updateLlmBudget(parsed);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't save — try again.", "error");
        return;
      }
      toast.show("Budget saved.");
    });
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {hasEverCalledModel ? (
          <p className="text-body text-ink">
            <span className="font-mono tabular-nums">${monthlySpend.spentUsd.toFixed(2)}</span> spent this month, of{" "}
            <span className="font-mono tabular-nums">${Number(profile.llm_monthly_budget_usd).toFixed(2)}</span>.
          </p>
        ) : (
          <p className="text-body text-ink">
            No model calls have been made yet. Every report so far has used the deterministic-only path — this isn&apos;t a
            $0.00 measurement of a working budget, it&apos;s an honest statement that the model layer hasn&apos;t run.
          </p>
        )}
        <p className="text-caption text-ink-faint">
          The nightly report runs on deterministic engine output regardless — the model layer only adds interpretation on
          top, and degrades to the deterministic report whenever it&apos;s unavailable or the budget below would be exceeded.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Input label="Monthly budget ceiling (USD)" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" />
        {error ? <FieldError>{error}</FieldError> : null}
      </div>

      <div>
        <Button onClick={handleSave} loading={isPending} disabled={budget === String(profile.llm_monthly_budget_usd)}>
          Save
        </Button>
      </div>
    </Panel>
  );
}
