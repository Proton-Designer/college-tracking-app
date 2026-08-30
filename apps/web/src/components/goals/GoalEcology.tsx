"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GOAL_RELATIONSHIPS, type GoalEcologyView } from "@collegeos/api";
import type { GoalPair, GoalRelationship } from "@collegeos/core";
import { Badge, Button, EmptyState, Input, Panel } from "@/components/ui";
import { markGoalPairAction, unmarkGoalPairAction } from "@/app/(app)/goals/goalsActions";

/**
 * Goal Ecology on the War Map (D49) — the pairs, not a score.
 *
 * A list of goals cannot express the thing that actually kills systems: two goals quietly working
 * against each other. "Wake at 5am" and "network four nights a week" are each reasonable and
 * jointly impossible, and nothing else in Ihsan notices that.
 *
 * Three rules this component exists to hold, each of which would be easy to break by making the
 * screen tidier:
 *
 * 1. **An unmarked pair reads as UNMARKED, never neutral.** Every unmarked pair is offered for
 *    marking with no chip preselected, and the count says "not marked yet" rather than folding
 *    them into the neutral pile. Neutral is a judgement someone made; unmarked is a question
 *    nobody has asked, and collapsing the two would inflate how examined a set of goals is.
 *
 * 2. **The examined share tells the truth.** It counts marked pairs over all pairs, and it goes
 *    DOWN when a mark is removed. It is stated as a plain fact, never as a target or a nag.
 *
 * 3. **Nothing tells you to drop a goal.** Competing pairs surface first and carry the user's own
 *    sentence about why; there is no "resolve", no "eliminate", no ranking, and no suggestion.
 *    The app makes the tension visible so the trade-off gets chosen rather than discovered in six
 *    weeks — choosing it stays the user's job.
 */
export interface GoalEcologyProps {
  view: GoalEcologyView;
}

/** The three answers, keyed by the enum so the record cannot silently miss one. The ORDER comes
 *  from `GOAL_RELATIONSHIPS` (the same list the data layer validates against), not from this
 *  object -- a fourth relationship added to the schema would appear here rather than vanish. */
const RELATIONSHIP_COPY: Record<GoalRelationship, { label: string; hint: string }> = {
  competing: { label: "Competing", hint: "Progress on one costs progress on the other" },
  neutral: { label: "Neutral", hint: "They do not conflict, but they share the same hours" },
  synergistic: { label: "Synergistic", hint: "Progress on one accelerates the other" },
};

function pairKey(pair: GoalPair): string {
  return `${pair.a.id}:${pair.b.id}`;
}

export function GoalEcology({ view }: GoalEcologyProps) {
  const { summary } = view;

  if (view.goals.length < 2) {
    return (
      <EmptyState
        title="One goal has nothing to compete with"
        description="Relationships are a property of a pair. Add a second goal and every pair between them appears here, unmarked, waiting for your read."
      />
    );
  }

  const markedCount = summary.totalPairs - summary.unmarked.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {summary.totalPairs} {summary.totalPairs === 1 ? "pair" : "pairs"}
        </p>
        {/* The honest share: marked over all, falling again the moment a mark is removed. Stated
            as a fact, with no target attached to it. */}
        <p className="font-mono text-label tabular-nums text-ink-faint">
          {markedCount} marked · {summary.unmarked.length} not marked yet
        </p>
      </div>

      {summary.competing.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-mono text-label uppercase tracking-[0.1em] text-ink">Competing</h3>
          <p className="text-body-s text-ink-muted">
            Both of these can matter. Naming the tension is what lets you choose the trade-off
            instead of discovering it in six weeks.
          </p>
          {summary.competing.map((pair) => (
            <PairCard key={pairKey(pair)} pair={pair} prominent />
          ))}
        </section>
      ) : null}

      {summary.unmarked.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Not marked yet</h3>
          <p className="text-body-s text-ink-faint">
            Unmarked is not neutral — it is a question nobody has asked yet. Answer the ones you
            have a read on and leave the rest.
          </p>
          {summary.unmarked.map((pair) => (
            <PairCard key={pairKey(pair)} pair={pair} />
          ))}
        </section>
      ) : null}

      {summary.synergistic.length > 0 || summary.neutral.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h3 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Marked</h3>
          {[...summary.synergistic, ...summary.neutral].map((pair) => (
            <PairCard key={pairKey(pair)} pair={pair} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function relationshipLabel(relationship: GoalRelationship | null): string {
  // The null case is the load-bearing one. It must never render as "Neutral".
  if (relationship == null) return "Unmarked";
  return RELATIONSHIP_COPY[relationship].label;
}

function PairCard({ pair, prominent = false }: { pair: GoalPair; prominent?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const [note, setNote] = useState(pair.note ?? "");
  const [editing, setEditing] = useState(pair.relationship == null);

  function mark(relationship: GoalRelationship) {
    setError(undefined);
    startTransition(async () => {
      const result = await markGoalPairAction({
        goalAId: pair.a.id,
        goalBId: pair.b.id,
        relationship,
        note,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that.");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function unmark() {
    setError(undefined);
    startTransition(async () => {
      const result = await unmarkGoalPairAction(pair.a.id, pair.b.id);
      if (!result.ok) {
        setError(result.error ?? "Couldn't clear that mark.");
        return;
      }
      setNote("");
      setEditing(true);
      router.refresh();
    });
  }

  return (
    <Panel tone={prominent ? "surface" : "sunken"} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body text-ink">
          {pair.a.title} <span className="text-ink-faint">↔</span> {pair.b.title}
        </p>
        <Badge tone={pair.relationship === "competing" ? "accent" : "neutral"}>
          {relationshipLabel(pair.relationship)}
        </Badge>
      </div>

      {/* The user's own sentence, shown wherever the pair is shown. This is the part they reread
          in ninety days, and it is what makes a competing pair actionable rather than flagged. */}
      {pair.note != null && !editing ? <p className="text-body-s text-ink-muted">{pair.note}</p> : null}

      {editing ? (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label={`How ${pair.a.title} and ${pair.b.title} relate`} className="flex flex-col gap-2">
            {GOAL_RELATIONSHIPS.map((value) => {
              const copy = RELATIONSHIP_COPY[value];
              const selected = pair.relationship === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  // No option is ever preselected on an unmarked pair -- `pair.relationship` is
                  // null there, so every chip reads unchecked. That is D49 in the markup.
                  aria-checked={selected}
                  disabled={isPending}
                  onClick={() => mark(value)}
                  className={
                    "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left " +
                    "outline-none transition-colors duration-90 " +
                    "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 " +
                    "disabled:cursor-not-allowed disabled:opacity-40 " +
                    (selected
                      ? "border-accent text-ink"
                      : "border-hairline text-ink-muted hover:border-ink-muted hover:text-ink")
                  }
                >
                  <span className="text-body-s">{copy.label}</span>
                  <span className="text-caption text-ink-faint">{copy.hint}</span>
                </button>
              );
            })}
          </div>
          <Input
            label="Why, in your words (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What actually collides here"
            disabled={isPending}
          />
          {pair.relationship != null ? (
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={isPending}
            className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint underline underline-offset-2 hover:text-ink disabled:opacity-40"
          >
            Change
          </button>
          {/* Back to unmarked, not to neutral. Without this the first tap would be permanent and
              the examined share could only ever climb. */}
          <button
            type="button"
            onClick={unmark}
            disabled={isPending}
            className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint underline underline-offset-2 hover:text-ink disabled:opacity-40"
          >
            Unmark
          </button>
        </div>
      )}

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </Panel>
  );
}
