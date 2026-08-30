"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MomOutcome, VisionChainView } from "@collegeos/api";
import { Button, ChipGroup, DatePicker, Input, Panel, Textarea } from "@/components/ui";
import { saveMomReviewAction } from "@/app/(app)/vision/visionActions";

/**
 * The 90-day review ritual (D48). Score it, write what happened, set the next one.
 *
 * **`changed` sits beside `hit`, not below `missed`.** It is offered in the same row, worded the
 * same way, with the same weight — because a beachhead that turned out to be the wrong beachhead
 * is information, and a form that filed it as a failure would teach people to stop noticing.
 *
 * **Setting the next M.O.M. is optional.** Closing without one is a complete review; "I need to
 * think about this" is an honest way to finish ninety days, and a required field here would
 * manufacture a plan to satisfy a form.
 */

export interface MomReviewClientProps {
  view: VisionChainView;
}

const OUTCOMES: { value: MomOutcome; label: string; blurb: string }[] = [
  { value: "hit", label: "Hit", blurb: "The outcome happened." },
  { value: "partial", label: "Partial", blurb: "Some of it happened." },
  { value: "missed", label: "Missed", blurb: "It did not happen." },
  {
    value: "changed",
    label: "Changed",
    blurb: "This stopped being the right ninety days. That is information, not a miss.",
  },
];

export function MomReviewClient({ view }: MomReviewClientProps) {
  const router = useRouter();
  const mom = view.mom;
  const [outcome, setOutcome] = useState<MomOutcome | null>(view.activeMomReview?.outcome ?? null);
  const [whatHappened, setWhatHappened] = useState(view.activeMomReview?.what_happened ?? "");
  const [settingNext, setSettingNext] = useState(false);
  const [nextTitle, setNextTitle] = useState("");
  const [nextTarget, setNextTarget] = useState("");
  const [nextStarts, setNextStarts] = useState<string | null>(null);
  const [nextEnds, setNextEnds] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  if (mom == null) {
    return (
      <Panel className="flex flex-col gap-2">
        <p className="text-body text-ink-muted">
          There is no M.O.M. open right now, so there is nothing to close. Set one on the chain and
          this ritual comes back when its ninety days are up.
        </p>
      </Panel>
    );
  }

  function handleSave() {
    if (mom == null) return;
    if (outcome == null) {
      setError("Pick how this M.O.M. actually went before saving.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await saveMomReviewAction({
        momId: mom.id,
        outcome,
        ...(whatHappened.trim().length > 0 ? { whatHappened } : {}),
        next:
          settingNext && nextTitle.trim().length > 0
            ? {
                title: nextTitle,
                ...(nextTarget.trim().length > 0 ? { target: nextTarget } : {}),
                startsOn: nextStarts,
                endsOn: nextEnds,
              }
            : null,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the review.");
        return;
      }
      router.push("/vision");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-2">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">The M.O.M. closing</p>
        <p className="text-body-l text-ink">{mom.title}</p>
        {mom.target != null ? <p className="text-body-s text-ink-muted">{mom.target}</p> : null}
        {mom.ends_on != null ? (
          <p className="font-mono text-label tabular-nums text-ink-muted">Ended {mom.ends_on}</p>
        ) : null}
      </Panel>

      <Panel title="How it actually went" className="flex flex-col gap-3">
        <ChipGroup
          label="Outcome"
          options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))}
          value={outcome}
          onChange={(value) => setOutcome(value as MomOutcome)}
          disabled={isPending}
        />
        {outcome != null ? (
          <p className="text-body-s text-ink-muted">
            {OUTCOMES.find((o) => o.value === outcome)?.blurb}
          </p>
        ) : null}
      </Panel>

      <Panel title="What happened" className="flex flex-col gap-3">
        <Textarea
          label="In your own words"
          rows={6}
          value={whatHappened}
          onChange={(e) => setWhatHappened(e.target.value)}
          placeholder="Optional. Nothing here is read by anything else in the app."
        />
      </Panel>

      <Panel title="The next ninety days" className="flex flex-col gap-3">
        {settingNext ? (
          <>
            <Input
              label="The next M.O.M."
              value={nextTitle}
              onChange={(e) => setNextTitle(e.target.value)}
            />
            <Input
              label="Measurable target (optional)"
              value={nextTarget}
              onChange={(e) => setNextTarget(e.target.value)}
            />
            <div className="flex flex-wrap gap-4">
              <DatePicker label="Starts" value={nextStarts} onValueChange={setNextStarts} />
              <DatePicker label="Ends" value={nextEnds} onValueChange={setNextEnds} />
            </div>
            <p className="text-body-s text-ink-muted">
              It inherits the mission above this one. If the mission is what changed, edit it on the
              chain — that is a separate decision from this one.
            </p>
            <div>
              <Button variant="ghost" onClick={() => setSettingNext(false)}>
                Actually, not yet
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body-s text-ink-muted">
              Closing without setting the next one is a complete review. Nothing is waiting on it.
            </p>
            <div>
              <Button variant="secondary" onClick={() => setSettingNext(true)}>
                Set the next M.O.M.
              </Button>
            </div>
          </>
        )}
      </Panel>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div>
        <Button onClick={handleSave} loading={isPending}>
          Close the ninety days
        </Button>
      </div>
    </div>
  );
}
