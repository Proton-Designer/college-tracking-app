"use client";

import type { Task } from "@collegeos/api";
import { useState, useTransition } from "react";
import { Button, Panel, Textarea } from "@/components/ui";
import { submitReview } from "@/app/review/actions";
import { FrictionPicker } from "./FrictionPicker";

export function ReviewForm({ today, incompleteMits }: { today: string; incompleteMits: Task[] }) {
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
      {incompleteMits.length > 0 ? (
        <Panel title="What got in the way?">
          <div className="flex flex-col gap-4">
            {incompleteMits.map((task) => (
              <FrictionPicker key={task.id} task={task} />
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel className="flex flex-col gap-5">
        <Textarea
          label="What went well"
          value={proudText}
          onChange={(e) => setProudText(e.target.value)}
          rows={3}
        />
        <Textarea
          label="What went wrong"
          value={wentWrongText}
          onChange={(e) => setWentWrongText(e.target.value)}
          rows={3}
        />
        <Textarea
          label="Anything important"
          value={importantNoteText}
          onChange={(e) => setImportantNoteText(e.target.value)}
          rows={3}
        />
        {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        <div>
          <Button onClick={handleSubmit} loading={isPending}>
            Save review
          </Button>
        </div>
      </Panel>
    </div>
  );
}
