"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DueQueueEntry } from "@collegeos/api";
import type { RetrievalConfidence } from "@collegeos/core";
import { Button, Panel } from "@/components/ui";
import { answerQuestionAction } from "@/app/(app)/drill/drillActions";

const CONFIDENCE_OPTIONS: readonly [RetrievalConfidence, string][] = [
  ["sure", "Sure"],
  ["thinkso", "Think so"],
  ["guessing", "Guessing"],
];

/** Web port of mobile's /drill state machine: confidence tap → reveal (answer + source
 *  anchor on screen so "check the material" is one glance) → self-graded verdict. */
export function DrillClient({
  initialQueue,
  courseCodeById,
}: {
  initialQueue: DueQueueEntry[];
  courseCodeById: Record<number, string>;
}) {
  const [queue] = useState<DueQueueEntry[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState<RetrievalConfidence | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState({ answered: 0, correct: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = queue[index] ?? null;

  function onConfidence(c: RetrievalConfidence) {
    setConfidence(c);
    setRevealed(true);
  }

  function onVerdict(correct: boolean) {
    if (current == null || confidence == null) return;
    setError(null);
    startTransition(async () => {
      const result = await answerQuestionAction(current.question.id, confidence, correct);
      if (!result.ok) {
        setError(result.error ?? "Could not record that answer.");
        return;
      }
      setDone((d) => ({ answered: d.answered + 1, correct: d.correct + (correct ? 1 : 0) }));
      setConfidence(null);
      setRevealed(false);
      setIndex((i) => i + 1);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {queue.length > 0 && current != null ? (
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {Math.min(index + 1, queue.length)} of {queue.length}
          {current.item.weighted ? " · weighted up — recent sure-but-wrong on this topic" : ""}
        </p>
      ) : null}

      {error != null ? (
        <Panel>
          <p className="text-body-s text-risk-critical">{error}</p>
        </Panel>
      ) : null}

      {current == null ? (
        <Panel>
          <p className="text-body-l text-ink">
            {done.answered > 0 ? `Queue clear — ${done.correct} of ${done.answered} right.` : "Nothing due."}
          </p>
          <p className="mt-2 text-body-s text-ink-muted">
            {done.answered > 0
              ? "Done is done. The next cards surface when they're due."
              : "Write questions after today's reading and they'll queue themselves."}
          </p>
          <div className="mt-4">
            <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
              Back to Today
            </Link>
          </div>
        </Panel>
      ) : (
        <Panel>
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            {courseCodeById[current.question.course_id] ?? `Course #${current.question.course_id}`}
            {current.question.topic != null ? ` · ${current.question.topic}` : ""}
          </p>
          <p className="mt-3 text-body-l text-ink">{current.question.prompt}</p>
          {!revealed ? (
            <>
              <p className="mt-3 text-body-s text-ink-muted">Answer it in your head first. How sure are you?</p>
              <div className="mt-4 flex gap-3">
                {CONFIDENCE_OPTIONS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onConfidence(value)}
                    className="flex-1 rounded-md border border-border py-3 text-center font-sans text-body text-ink transition-colors duration-150 hover:border-ink-muted focus-visible:border-accent focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="text-body text-ink">{current.question.answer}</p>
                <p className="mt-3 text-body-s text-ink-faint">
                  {current.question.source_anchor != null
                    ? `Check it: ${current.question.source_anchor}`
                    : "No source recorded for this one."}
                </p>
              </div>
              <div className="mt-4 flex gap-3">
                <Button className="flex-1" onClick={() => onVerdict(true)} loading={isPending}>
                  Right
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => onVerdict(false)} disabled={isPending}>
                  Wrong
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
