"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRIORITY_MAX, type ScoredGoal } from "@collegeos/core";
import { Button, SegmentedControl } from "@/components/ui";
import {
  clearGoalPriorityScoresAction,
  setGoalPriorityScoresAction,
} from "@/app/(app)/goals/goalsActions";

/**
 * The Priority Matrix for one goal — D49's optional gate on what enters the War Map.
 *
 * **Optional is the whole design, not a caveat.** It is collapsed by default, it never blocks
 * adding a goal, and a goal nobody has scored shows NO COMPOSITE AT ALL — not a dash, not a zero,
 * not a "not yet scored: 0%". A required scoring ritual on every goal is friction that gets
 * skipped, and a skipped ritual teaches people to ignore the app.
 *
 * Two things this component deliberately does not do:
 *
 * 1. **It never ranks.** The composite is shown on the goal it belongs to and nowhere else. There
 *    is no sorted list, no "your highest-leverage goal", no badge on the winner. `scoreGoals` in
 *    core refuses to sort for the same reason: the matrix is a gate the user applies, not a verdict
 *    the app hands back.
 *
 * 2. **It never suggests dropping anything.** No threshold turns a composite red, and nothing here
 *    reads a low score as a recommendation.
 *
 * The composite itself is `priorityComposite`'s, computed in core and passed in — it is never
 * derived in this file, so the number on the screen cannot drift from the four beneath it.
 */
export interface PriorityMatrixProps {
  goalId: number;
  scored: ScoredGoal | undefined;
  /** The user's LOCAL today — `scored_on` is a date the user stood in, not UTC's. */
  today: string;
}

const FIELDS = [
  { key: "visionAlignment", label: "Vision alignment", hint: "How directly this advances the 10-year vision" },
  { key: "leverage", label: "Leverage", hint: "Impact per unit of time invested" },
  { key: "compoundBenefit", label: "Compound benefit", hint: "Whether the benefit compounds or is one-time" },
  {
    key: "opportunityCost",
    label: "Opportunity cost",
    // Said out loud because the number is stored as given and inverted only in the composite. A
    // user who thinks 5 means "cheap" would score the whole matrix backwards.
    hint: "What you are NOT doing if you choose this. High means giving up a lot.",
  },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Draft = Partial<Record<FieldKey, number>>;

export function PriorityMatrix({ goalId, scored, today }: PriorityMatrixProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() =>
    scored?.scores == null
      ? {}
      : {
          visionAlignment: scored.scores.visionAlignment,
          leverage: scored.scores.leverage,
          compoundBenefit: scored.scores.compoundBenefit,
          opportunityCost: scored.scores.opportunityCost,
        },
  );

  const complete = FIELDS.every((f) => draft[f.key] != null);

  function handleSave() {
    setError(undefined);
    if (!complete) return;
    startTransition(async () => {
      const result = await setGoalPriorityScoresAction({
        goalId,
        visionAlignment: draft.visionAlignment!,
        leverage: draft.leverage!,
        compoundBenefit: draft.compoundBenefit!,
        opportunityCost: draft.opportunityCost!,
        scoredOn: today,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save those scores.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function handleClear() {
    setError(undefined);
    startTransition(async () => {
      const result = await clearGoalPriorityScoresAction(goalId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't clear those scores.");
        return;
      }
      setDraft({});
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          {open ? "Hide priority matrix" : scored?.scores != null ? "Priority matrix" : "Score this goal (optional)"}
        </button>
        {/* An unscored goal shows nothing here. Not a dash, not a zero -- an unevaluated goal is
            not a badly-scoring one, and a placeholder would say otherwise (D40's rule, applied). */}
        {scored?.composite != null ? (
          <span className="font-mono text-label tabular-nums text-ink-muted">
            Composite {scored.composite.toFixed(2)}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="glass-sunken flex flex-col gap-4 rounded-md p-3">
          <p className="text-body-s text-ink-faint">
            Four scores, 1–{PRIORITY_MAX}. Entirely optional — a goal works fine unscored, and
            nothing here ranks your goals against each other.
          </p>
          {FIELDS.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <SegmentedControl
                label={field.label}
                value={draft[field.key] ?? null}
                onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
                min={1}
                max={PRIORITY_MAX}
                disabled={isPending}
              />
              <span className="text-caption text-ink-faint">{field.hint}</span>
            </div>
          ))}

          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={isPending || !complete} loading={isPending}>
              Save scores
            </Button>
            {scored?.scores != null ? (
              <Button variant="ghost" onClick={handleClear} disabled={isPending}>
                Clear scores
              </Button>
            ) : null}
          </div>
          {!complete ? (
            <p className="text-caption text-ink-faint">
              All four, or none — a composite over a half-filled matrix would be a number from an
              unfinished answer.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
