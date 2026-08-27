"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardRow, CardType } from "@collegeos/api";
import { Button, ChipGroup, EmptyState, Input, Panel } from "@/components/ui";
import { addCardAction, retireCardAction } from "@/app/(app)/cards/cardsActions";

/** Display order and labels. Part VIII's tiny-vocabulary rule: these are the in-app words. */
const TYPES: { value: CardType; label: string; hint: string }[] = [
  { value: "goal", label: "Goals", hint: "The five, each with its number and deadline." },
  { value: "motivation", label: "Motivation", hint: "Short and private. Why you're doing this." },
  { value: "thought_habit", label: "Thought habits", hint: "When X, think Y." },
  { value: "trait", label: "2.0 traits", hint: "Beliefs, character, skills of the next version." },
  { value: "tenx", label: "10X", hint: "One static card. Shown outside rotation." },
];

export interface CardsClientProps {
  initialCards: CardRow[];
}

export function CardsClient({ initialCards }: CardsClientProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<CardType>("goal");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const activeHint = TYPES.find((t) => t.value === draftType)?.hint;

  function handleAdd() {
    setError(undefined);
    startTransition(async () => {
      const result = await addCardAction(draftType, draft);
      if (!result.ok) {
        setError(result.error ?? "Could not add the card.");
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  function handleRetire(cardId: number) {
    setError(undefined);
    startTransition(async () => {
      const result = await retireCardAction(cardId);
      if (!result.ok) {
        setError(result.error ?? "Could not retire the card.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Add a card" className="flex flex-col gap-3">
        <ChipGroup
          label="Type"
          options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={draftType}
          onChange={(value) => setDraftType(value as CardType)}
          disabled={isPending}
        />
        {activeHint ? <p className="text-body-s text-ink-muted">{activeHint}</p> : null}
        <Input
          label="Text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="One line"
          disabled={isPending}
        />
        {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        <div>
          <Button onClick={handleAdd} loading={isPending} disabled={draft.trim().length === 0}>
            Add card
          </Button>
        </div>
      </Panel>

      {initialCards.filter((c) => c.active).length === 0 ? (
        <EmptyState
          title="Nothing on the wall yet"
          description="Add a goal, a motivation, a thought habit, a trait, or the one 10X card — they'll rotate at the end of every Hour."
        />
      ) : null}

      {TYPES.map((t) => {
        const group = initialCards.filter((c) => c.type === t.value && c.active);
        if (group.length === 0) return null;
        return (
          <div key={t.value} className="flex flex-col gap-2">
            <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{t.label}</h2>
            <ul className="flex flex-col gap-2">
              {group.map((card) => (
                <li key={card.id}>
                  <Panel tone="sunken" className="flex flex-row items-center gap-3">
                    <p className="flex-1 text-body text-ink">{card.text}</p>
                    <button
                      type="button"
                      onClick={() => handleRetire(card.id)}
                      disabled={isPending}
                      className="font-sans text-body-s text-ink-muted underline underline-offset-2 outline-none hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Retire
                    </button>
                  </Panel>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
