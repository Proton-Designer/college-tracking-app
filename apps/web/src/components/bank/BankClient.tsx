"use client";

import { useCallback, useState, useTransition } from "react";
import type { DraftedQuestion, QuestionRow } from "@collegeos/api";
import { Button, Input, Panel, Textarea } from "@/components/ui";
import {
  addQuestionAction,
  draftFromNotesAction,
  listCourseQuestionsAction,
  retireQuestionAction,
} from "@/app/(app)/courses/[id]/bankActions";

type Draft = DraftedQuestion & { anchor: string; skipped: boolean };

/** Web port of mobile's /bank body -- same flows, same guards: anchor-or-skip enforced
 *  per card, AI drafts are editable proposals, topic persists across adds because a run
 *  of questions on one topic is the normal writing flow. */
export function BankClient({
  courseId,
  initialQuestions,
}: {
  courseId: number;
  initialQuestions: QuestionRow[];
}) {
  const [questions, setQuestions] = useState<QuestionRow[]>(initialQuestions);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [anchor, setAnchor] = useState("");
  const [anchorSkipped, setAnchorSkipped] = useState(false);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDrafting, startDrafting] = useTransition();

  const refresh = useCallback(async () => {
    const result = await listCourseQuestionsAction(courseId);
    if (result.ok && result.data) setQuestions(result.data);
  }, [courseId]);

  function onAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addQuestionAction({
        courseId,
        prompt,
        answer,
        ...(anchorSkipped ? { sourceSkipped: true } : { sourceAnchor: anchor }),
        ...(topic.trim() !== "" ? { topic } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not add the question.");
        return;
      }
      setPrompt("");
      setAnswer("");
      setAnchor("");
      setAnchorSkipped(false);
      // Topic is kept: writing a run of questions on one topic is the normal flow.
      await refresh();
    });
  }

  function onDraft() {
    setError(null);
    setDraftNote(null);
    startDrafting(async () => {
      const result = await draftFromNotesAction(notes);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Drafting failed.");
        return;
      }
      if (result.data.kind === "tooThin") {
        setDraftNote("Not enough substance to draft from — paste a fuller section of notes.");
        return;
      }
      // Anchor prefilled from the model's sourceHint when the notes contained one; never
      // invented. The accept path still enforces anchor-or-skip per card.
      setDrafts(result.data.questions.map((q) => ({ ...q, anchor: q.sourceHint ?? "", skipped: false })));
      setNotes("");
    });
  }

  function onAcceptDraft(draftIndex: number) {
    const d = drafts[draftIndex];
    if (d == null) return;
    setError(null);
    startTransition(async () => {
      const result = await addQuestionAction({
        courseId,
        prompt: d.prompt,
        answer: d.answer,
        topic: d.topic,
        origin: "ai",
        ...(d.skipped ? { sourceSkipped: true } : { sourceAnchor: d.anchor }),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not accept that card.");
        return;
      }
      setDrafts((prev) => prev.filter((_, i) => i !== draftIndex));
      await refresh();
    });
  }

  function patchDraft(draftIndex: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === draftIndex ? { ...d, ...patch } : d)));
  }

  function onRetire(questionId: number) {
    setError(null);
    startTransition(async () => {
      const result = await retireQuestionAction(questionId);
      if (!result.ok) setError(result.error ?? "Could not retire the question.");
      await refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error != null ? (
        <Panel>
          <p className="text-body-s text-risk-critical">{error}</p>
        </Panel>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Panel title="New question" className="flex-1">
          <div className="flex flex-col gap-4">
            <Textarea label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isPending} rows={3} />
            <Textarea label="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={isPending} rows={3} />
            {anchorSkipped ? (
              <button
                type="button"
                onClick={() => setAnchorSkipped(false)}
                className="self-start text-body-s text-ink-muted underline underline-offset-2"
              >
                Source skipped — recorded, not forgotten. Click to add one after all.
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <Input
                  label="Source anchor"
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value)}
                  placeholder="p. 142 / slide 18 / lecture 2026-09-03"
                  disabled={isPending}
                />
                <button
                  type="button"
                  onClick={() => setAnchorSkipped(true)}
                  className="self-start text-body-s text-ink-faint underline underline-offset-2"
                >
                  No source for this one
                </button>
              </div>
            )}
            <Input label="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="sampling bias" disabled={isPending} />
            <div>
              <Button
                onClick={onAdd}
                loading={isPending}
                disabled={prompt.trim() === "" || answer.trim() === "" || (!anchorSkipped && anchor.trim() === "")}
              >
                Add to the Bank
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title="Draft from notes" className="flex-1">
          <div className="flex flex-col gap-4">
            <p className="text-body-s text-ink-muted">
              Paste a section of notes; you edit every card before it enters the Bank.
            </p>
            <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isDrafting} rows={6} />
            {draftNote != null ? <p className="text-body-s text-ink-muted">{draftNote}</p> : null}
            <div>
              <Button variant="secondary" onClick={onDraft} disabled={notes.trim().length < 200} loading={isDrafting}>
                {isDrafting ? "Drafting…" : "Draft questions"}
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      {drafts.map((d, i) => (
        <Panel key={`${d.prompt}-${i}`} title="Draft — edit, then accept">
          <div className="flex flex-col gap-4">
            <Textarea label="Prompt" value={d.prompt} onChange={(e) => patchDraft(i, { prompt: e.target.value })} rows={2} />
            <Textarea label="Answer" value={d.answer} onChange={(e) => patchDraft(i, { answer: e.target.value })} rows={2} />
            <Input label="Topic" value={d.topic} onChange={(e) => patchDraft(i, { topic: e.target.value })} />
            {d.skipped ? (
              <button
                type="button"
                onClick={() => patchDraft(i, { skipped: false })}
                className="self-start text-body-s text-ink-muted underline underline-offset-2"
              >
                Source skipped. Click to add one.
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <Input
                  label="Source anchor"
                  value={d.anchor}
                  onChange={(e) => patchDraft(i, { anchor: e.target.value })}
                  placeholder="p. 142 / slide 18"
                />
                <button
                  type="button"
                  onClick={() => patchDraft(i, { skipped: true })}
                  className="self-start text-body-s text-ink-faint underline underline-offset-2"
                >
                  No source for this one
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                onClick={() => onAcceptDraft(i)}
                disabled={d.prompt.trim() === "" || d.answer.trim() === "" || (!d.skipped && d.anchor.trim() === "")}
              >
                Accept
              </Button>
              <Button variant="secondary" onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}>
                Discard
              </Button>
            </div>
          </div>
        </Panel>
      ))}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          In the Bank — {questions.length}
        </h2>
        {questions.length === 0 ? (
          <p className="text-body-s text-ink-muted">
            No questions yet. Write them after today&apos;s reading and they&apos;ll queue themselves.
          </p>
        ) : (
          questions.map((q) => (
            <div key={q.id} className="glass flex items-start gap-3 rounded-md p-4">
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-body text-ink">{q.prompt}</p>
                <p className="text-body-s text-ink-muted">
                  {q.topic != null ? `${q.topic} · ` : ""}
                  {q.source_anchor ?? "no source"}
                  {q.origin !== "self" ? ` · ${q.origin}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRetire(q.id)}
                aria-label={`Retire question: ${q.prompt}`}
                className="text-body-s text-ink-faint underline underline-offset-2 hover:text-ink"
              >
                Retire
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
