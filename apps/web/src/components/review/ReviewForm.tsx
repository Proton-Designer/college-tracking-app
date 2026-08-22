"use client";

import type { DailyPredictionRow, NightReviewDraft, Task } from "@collegeos/api";
import { useState, useTransition } from "react";
import { Button, Panel } from "@/components/ui";
import { submitReview } from "@/app/(app)/review/actions";
import { DictatedTextarea } from "./DictatedTextarea";
import { FrictionPicker } from "./FrictionPicker";
import { ReviewDraft } from "./ReviewDraft";

export function ReviewForm({
  today,
  incompleteMits,
  draft,
  draftCompletionPct,
  prediction,
}: {
  today: string;
  incompleteMits: Task[];
  draft: NightReviewDraft;
  draftCompletionPct: number;
  prediction: DailyPredictionRow | null;
}) {
  const [proudText, setProudText] = useState("");
  const [wentWrongText, setWentWrongText] = useState("");
  const [importantNoteText, setImportantNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitReview({
        localDate: today,
        ...(proudText.trim() ? { proudText: proudText.trim() } : {}),
        ...(wentWrongText.trim() ? { wentWrongText: wentWrongText.trim() } : {}),
        ...(importantNoteText.trim() ? { importantNoteText: importantNoteText.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save — try again.");
        return;
      }
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <Panel className="flex flex-col gap-2">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-accent">Review saved</p>
        <p className="text-body text-ink-muted">Tonight&apos;s review is in. See you tomorrow morning.</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* R2: the review leads with what the record already says, and only then asks for
          prose. This screen's job is not to collect a journal -- it's to let the measured
          day argue with the remembered one. So the numbers come first, the friction capture
          for what actually didn't happen comes second, and free text is explicitly framed as
          the residue: the part the instruments couldn't see. */}
      <ReviewDraft draft={draft} draftCompletionPct={draftCompletionPct} prediction={prediction} />

      {incompleteMits.length > 0 ? (
        <section className="flex flex-col gap-3 border-t border-hairline pt-6">
          <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">What got in the way?</h2>
          <Panel>
            <div className="flex flex-col gap-4">
              {incompleteMits.map((task) => (
                <FrictionPicker key={task.id} task={task} />
              ))}
            </div>
          </Panel>
        </section>
      ) : null}

      <section className="flex flex-col gap-3 border-t border-hairline pt-6">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          In your own words
        </h2>
        <p className="text-body-s text-ink-muted">
          Optional. The numbers above are already recorded — this is for what they can&apos;t see.
        </p>
        <Panel className="flex flex-col gap-5">
          <DictatedTextarea label="What went well" value={proudText} onValueChange={setProudText} rows={2} />
          <DictatedTextarea label="What went wrong" value={wentWrongText} onValueChange={setWentWrongText} rows={2} />
          <DictatedTextarea
            label="Anything important"
            value={importantNoteText}
            onValueChange={setImportantNoteText}
            rows={2}
          />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
          <div>
            <Button onClick={handleSubmit} loading={isPending}>
              Save review
            </Button>
          </div>
        </Panel>
      </section>
    </div>
  );
}
