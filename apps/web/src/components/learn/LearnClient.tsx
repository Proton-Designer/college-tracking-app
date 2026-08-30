"use client";

import type { DailySessionView, LearnCard } from "@collegeos/api";
import type { LessonRating } from "@collegeos/core";
import { SESSION_TYPE_LABELS } from "@collegeos/core";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, EmptyState, Panel, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/components/ui/cn";
import {
  completeSessionAction,
  recordReviewAction,
  startSessionAction,
} from "@/app/(app)/learn/learnActions";

/**
 * The daily retention session.
 *
 * Three rules from the research are structural here rather than encouraged:
 *
 * 1. **Free recall before reveal.** The answer is not in the DOM until the user has committed to an
 *    attempt. Recognition-only flipping is not offered, because the generation effect depends on
 *    the attempt existing — an interface that lets you peek is a different intervention.
 * 2. **Grading is only available after the reveal.** FSRS's four grades describe how hard the
 *    recall *was*, which is not a question you can answer before trying.
 * 3. **The queue's order is not the user's to shuffle.** Interleaving across sources is what makes
 *    retrieval discriminative rather than pattern-matched, so there is no "skip to that book".
 *
 * The comeback moment (D29, as the owner amended it) fires on completion, from the server's own
 * count of what is still due — never from anything this component believes.
 */

type Phase = "idle" | "recall" | "revealed" | "done";

const RATINGS: { rating: LessonRating; label: string; hint: string }[] = [
  { rating: "again", label: "Again", hint: "Couldn't recall it" },
  { rating: "hard", label: "Hard", hint: "Got there with effort" },
  { rating: "good", label: "Good", hint: "Recalled it" },
  { rating: "easy", label: "Easy", hint: "Immediate" },
];

export function LearnClient({ view }: { view: DailySessionView }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const queue = useMemo(() => {
    const ids = [
      ...(view.plan.warmUp ? [view.plan.warmUp.cardId] : []),
      ...view.plan.due.map((c) => c.cardId),
      ...view.plan.introductions.map((c) => c.cardId),
    ];
    return ids.map((id) => view.cards.get(id)).filter((c): c is LearnCard => c != null);
  }, [view]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [dueBefore, setDueBefore] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [comeback, setComeback] = useState<{ daysAway: number | null; waiting: number } | null>(null);
  const shownAt = useRef<number>(0);

  const card = queue[index] ?? null;
  const introducedCount = view.plan.introductions.length;

  function begin() {
    startTransition(async () => {
      const result = await startSessionAction();
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      setSessionId(result.data.sessionId);
      setDueBefore(result.data.dueBefore);
      setPhase("recall");
      shownAt.current = Date.now();
    });
  }

  function reveal() {
    setPhase("revealed");
  }

  function grade(rating: LessonRating) {
    if (!card) return;

    startTransition(async () => {
      // Read the clock inside the transition, not in the handler body: the lint rule treats a
      // component-scope Date.now() as render-time impurity, and it is right that the elapsed
      // measurement belongs with the write it describes.
      const elapsedMs = shownAt.current > 0 ? Date.now() - shownAt.current : undefined;
      const result = await recordReviewAction({
        cardId: card.card.id,
        rating,
        ...(sessionId != null ? { sessionId } : {}),
        ...(elapsedMs != null ? { elapsedMs } : {}),
        ...(answer.trim().length > 0 ? { answeredText: answer } : {}),
      });
      if (!result.ok) {
        toast.show(result.error);
        return;
      }

      const nextReviewed = reviewed + 1;
      setReviewed(nextReviewed);
      setAnswer("");

      if (index + 1 < queue.length) {
        setIndex(index + 1);
        setPhase("recall");
        shownAt.current = Date.now();
        return;
      }

      if (sessionId != null) {
        const done = await completeSessionAction({
          sessionId,
          cardsReviewed: nextReviewed,
          newLessonsIntroduced: introducedCount,
          dueBeforeSession: dueBefore,
        });
        if (done.ok && done.data.justRecovered) {
          setComeback({ daysAway: done.data.daysAway, waiting: done.data.waiting });
        }
      }
      setPhase("done");
      router.refresh();
    });
  }

  // --- Empty states. Each says WHY it is empty, which is a different sentence every time. ---
  if (queue.length === 0) {
    if (view.totalSources === 0) {
      return (
        <Panel>
          <EmptyState
            title="Nothing to learn from yet"
            description="Add a source — a book, an article, a talk — and Ihsan turns it into lessons you can actually recall weeks later. Nothing is scheduled until there is something to schedule."
            action={
              <Link href="/learn/library" className="font-mono text-body-s text-accent underline underline-offset-2">
                Add a source
              </Link>
            }
          />
        </Panel>
      );
    }
    if (view.sourcesProcessing > 0) {
      return (
        <Panel>
          <EmptyState
            title={`Still reading ${view.sourcesProcessing === 1 ? "your source" : `${view.sourcesProcessing} sources`}`}
            description="Extraction runs on the server and takes a few minutes for a full book. The deck appears here when every lesson has a passage behind it — a lesson that cannot cite the text it came from is dropped rather than shown."
          />
        </Panel>
      );
    }
    return (
      <Panel>
        <EmptyState
          title="Nothing due today"
          description="That is the scheduler working, not a gap. Cards come back when you are about to forget them, which is later than it feels."
        />
      </Panel>
    );
  }

  if (phase === "idle") {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Today&apos;s session</p>
            <p className="font-mono text-metric-xl text-ink">{queue.length}</p>
            <p className="text-body-s text-ink-muted">
              {view.plan.due.length + (view.plan.warmUp ? 1 : 0)} due
              {introducedCount > 0 ? ` · ${introducedCount} new` : ""}
              {" · about "}
              {Math.max(1, Math.round(queue.length * 0.4))} min
            </p>
          </div>
          {view.comeback.daysAway != null && view.comeback.daysAway >= 2 ? (
            <p className="text-body text-ink">
              {view.comeback.daysAway} days away. {view.comeback.waiting} cards were waiting — clear them and
              you&apos;re current.
            </p>
          ) : null}
          <Button onClick={begin} loading={isPending}>
            Start
          </Button>
        </div>
      </Panel>
    );
  }

  if (phase === "done") {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-3">
          {comeback ? (
            <>
              <p className="font-mono text-label uppercase tracking-[0.1em] text-domain-business">Back</p>
              <p className="text-body-l text-ink">
                {comeback.daysAway} days away. {comeback.waiting} cards were waiting; you cleared them.
                You&apos;re current.
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Done</p>
              <p className="text-body-l text-ink">
                {reviewed} {reviewed === 1 ? "card" : "cards"} reviewed.
              </p>
            </>
          )}
          <Link href="/learn/library" className="font-mono text-body-s text-accent underline underline-offset-2">
            See memory strength by source
          </Link>
        </div>
      </Panel>
    );
  }

  if (!card) return null;

  const isNew = card.session.schedule.state === "new";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {index + 1} of {queue.length}
          {isNew ? " · new" : ""}
        </p>
        <p className="font-mono text-caption text-ink-faint">{card.lesson.title}</p>
      </div>

      <Panel>
        <div className="flex flex-col gap-5">
          <p className="text-body-l text-ink">{card.card.prompt}</p>

          {phase === "recall" ? (
            <>
              <Textarea
                label="Answer from memory"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={4}
                placeholder="Write what you remember. Getting it wrong here is the point — the attempt is what makes it stick."
              />
              <div className="flex items-center gap-3">
                <Button onClick={reveal}>Show the answer</Button>
                <p className="text-body-s text-ink-muted">
                  {answer.trim().length === 0 ? "You can reveal without writing — but the attempt is the intervention." : " "}
                </p>
              </div>
            </>
          ) : (
            <>
              {answer.trim().length > 0 ? (
                <div className="rounded-md border border-hairline bg-surface-sunken p-4">
                  <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">You wrote</p>
                  <p className="mt-2 whitespace-pre-wrap text-body text-ink-muted">{answer}</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">The lesson</p>
                <p className="text-body text-ink">{card.card.answer}</p>
              </div>

              <details className="group">
                <summary className="cursor-pointer font-mono text-caption text-ink-faint hover:text-ink-muted">
                  Where this came from
                  {card.lesson.page_ref != null ? ` · p. ${card.lesson.page_ref}` : ""}
                </summary>
                {/* The grounding passage, verbatim from the source. It is stored as the chunk's own
                    substring rather than the model's rendition, so what is quoted here provably came
                    out of the file. */}
                <blockquote className="mt-3 border-l-2 border-hairline pl-4 text-body-s italic text-ink-muted">
                  {card.lesson.provenance_quote}
                </blockquote>
              </details>

              {card.lesson.claim_to_task ? (
                <div className="rounded-md border border-hairline p-4">
                  <p className="font-mono text-label uppercase tracking-[0.1em] text-domain-business">Try it</p>
                  <p className="mt-2 text-body text-ink">{card.lesson.claim_to_task}</p>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">How hard was that?</p>
                <div className="flex flex-wrap gap-2">
                  {RATINGS.map((option) => (
                    <button
                      key={option.rating}
                      type="button"
                      disabled={isPending}
                      onClick={() => grade(option.rating)}
                      title={option.hint}
                      className={cn(
                        "flex h-10 items-center rounded-md border border-border px-4",
                        "font-sans text-body text-ink outline-none transition-colors duration-150",
                        "hover:bg-surface-sunken focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                        "disabled:pointer-events-none disabled:opacity-40",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

/** Named so the Hours-vs-Learn distinction (D28) reads the same everywhere it is mentioned. */
export const LEARN_SESSION_LABEL = SESSION_TYPE_LABELS.learn;
