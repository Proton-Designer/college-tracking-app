"use client";

import type { DaySignalView } from "@collegeos/api";
import {
  DOMAIN_LABELS,
  LIFE_DOMAINS,
  STEP_MINUTES,
  decrement,
  emptyAllocation,
  increment,
  wastedMinutes,
  type Allocation,
  type LifeDomain,
} from "@collegeos/core";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { saveAllocationAction } from "@/app/(app)/nightplan/signalActions";

/**
 * The close-out's unaccounted-time question — D33 as the owner amended it.
 *
 * The rule this component exists to implement: **a window is pre-filled only from evidence that
 * already carries its own account of the time, and every other gap is an explicit question about a
 * visible span.** So what arrives here has already been filtered server-side — an Hour with a
 * deliverable accounted for its own window and is not asked about — and what remains is shown as
 * "2:00–4:00", named, with its minutes, waiting for an answer.
 *
 * Three things this component deliberately does NOT do:
 *
 * - It never defaults a gap to wasted. Unaccounted minutes are what is left after the user assigns
 *   what they can remember; the app does not assign them.
 * - It never submits on its own, and skipping is a first-class outcome. A skipped window stays
 *   `unknown`, and unknown is excluded from coverage rather than counted against anyone.
 * - It shows no total score. The point of the ritual is the admission, not the grade.
 *
 * If this ever becomes silent inference, the metric stops measuring the thing it was built to
 * measure and becomes an activity log wearing its name.
 */
export function UnaccountedGaps({
  view,
  windowMinutes,
  timeZone,
}: {
  view: DaySignalView;
  windowMinutes: number;
  timeZone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [allocation, setAllocation] = useState<Allocation>(emptyAllocation);

  const gaps = view.gaps;
  const gap = gaps[index] ?? null;

  function formatSpan(startIso: string, endIso: string): string {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${fmt.format(new Date(startIso))} – ${fmt.format(new Date(endIso))}`;
  }

  function advance() {
    setAllocation(emptyAllocation());
    setIndex((i) => i + 1);
    router.refresh();
  }

  function save() {
    if (!gap) return;
    startTransition(async () => {
      const result = await saveAllocationAction({
        windowStart: gap.start,
        windowEnd: gap.end,
        minutesByDomain: allocation,
      });
      if (!result.ok) {
        toast.show(result.error);
        return;
      }
      advance();
    });
  }

  // Nothing to ask about is a real and good state, and reads very differently from an empty
  // screen: it means every closed window today is accounted for.
  if (gaps.length === 0) {
    return (
      <Panel>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Where the day went</p>
        <p className="mt-2 text-body text-ink">Every hour today is accounted for.</p>
        {view.coverage.prefilled > 0 ? (
          <p className="mt-1 text-body-s text-ink-muted">
            {view.coverage.prefilled} {view.coverage.prefilled === 1 ? "window" : "windows"} filled themselves
            from work you&apos;d already logged.
          </p>
        ) : null}
      </Panel>
    );
  }

  if (!gap) {
    return (
      <Panel>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Where the day went</p>
        <p className="mt-2 text-body text-ink">Done — that&apos;s all of them.</p>
      </Panel>
    );
  }

  const unassigned = wastedMinutes(allocation, windowMinutes);
  const assignedAny = unassigned < windowMinutes;

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Where the day went</p>
          <p className="font-mono text-caption text-ink-faint">
            {index + 1} of {gaps.length}
          </p>
        </div>

        <div>
          <p className="font-mono text-metric tabular-nums text-ink">{formatSpan(gap.start, gap.end)}</p>
          <p className="mt-1 text-body-s text-ink-muted">
            {gap.minutes} minutes with nothing logged against them. What were you doing?
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {LIFE_DOMAINS.map((domain) => (
            <DomainRow
              key={domain}
              domain={domain}
              minutes={allocation[domain]}
              disabled={isPending}
              onAdd={() => setAllocation((a) => increment(a, domain, windowMinutes))}
              onRemove={() => setAllocation((a) => decrement(a, domain))}
            />
          ))}
        </div>

        <div className="flex items-baseline justify-between border-t border-hairline pt-3">
          <span className="text-body text-ink-muted">Unaccounted</span>
          {/* Derived, never an input. It is what is left over -- which is why it cannot be
              edited away, and why the app never fills it in for you. */}
          <span className="font-mono text-body tabular-nums text-ink-muted">{unassigned}m</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={isPending} disabled={!assignedAny}>
            Save
          </Button>
          <Button variant="ghost" onClick={advance} disabled={isPending}>
            Skip this one
          </Button>
          <p className="text-body-s text-ink-muted">
            Skipping leaves it unknown. Unknown never counts against you.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function DomainRow({
  domain,
  minutes,
  disabled,
  onAdd,
  onRemove,
}: {
  domain: LifeDomain;
  minutes: number;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-pill"
          style={{ backgroundColor: `var(--color-domain-${domain})` }}
        />
        <span className="truncate text-body text-ink">{DOMAIN_LABELS[domain]}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-right font-mono text-body-s tabular-nums text-ink-muted">{minutes}m</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled || minutes === 0}
          aria-label={`Remove ${STEP_MINUTES} minutes from ${DOMAIN_LABELS[domain]}`}
          className="flex size-9 items-center justify-center rounded-md border border-border font-mono text-body text-ink outline-none transition-colors duration-150 hover:bg-surface-sunken focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-30"
        >
          −
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          aria-label={`Add ${STEP_MINUTES} minutes to ${DOMAIN_LABELS[domain]}`}
          className="flex size-9 items-center justify-center rounded-md border border-border font-mono text-body text-ink outline-none transition-colors duration-150 hover:bg-surface-sunken focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
