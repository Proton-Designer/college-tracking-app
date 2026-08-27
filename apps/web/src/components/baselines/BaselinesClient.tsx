"use client";

import { useState, useTransition } from "react";
import { DEFAULT_BASELINE_HOURS } from "@collegeos/core";
import { Panel } from "@/components/ui";
import { setBaselinesAction } from "@/app/(app)/baselines/baselinesActions";

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Monday" },
  { iso: 2, label: "Tuesday" },
  { iso: 3, label: "Wednesday" },
  { iso: 4, label: "Thursday" },
  { iso: 5, label: "Friday" },
  { iso: 6, label: "Saturday" },
  { iso: 7, label: "Sunday" },
];

const MAX_BASELINE = 12;

export interface BaselinesClientProps {
  initialMap: Record<string, number>;
}

export function BaselinesClient({ initialMap }: BaselinesClientProps) {
  const [map, setMap] = useState<Record<string, number>>(initialMap);
  const [error, setError] = useState<string | undefined>(undefined);
  const [, startTransition] = useTransition();

  // Optimistic, with rollback -- same convention as the mobile stepper and the Hour's
  // distraction counter: a tap reads instantly, and the server call reconciles or reverts.
  function setBaseline(iso: number, value: number) {
    const clamped = Math.max(0, Math.min(MAX_BASELINE, value));
    const previous = map;
    const next = { ...map, [String(iso)]: clamped };
    setError(undefined);
    setMap(next);
    startTransition(async () => {
      const result = await setBaselinesAction(next);
      if (!result.ok) {
        setMap(previous);
        setError(result.error ?? "Couldn't save that baseline.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-s text-ink-muted">
        Fit it to your real schedule — an honest 2 beats a fictional 4. Zero is a legal value: a deliberate rest
        day.
      </p>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <Panel className="flex flex-col divide-y divide-hairline">
        {WEEKDAYS.map(({ iso, label }) => {
          const value = map[String(iso)] ?? DEFAULT_BASELINE_HOURS;
          return (
            <div key={iso} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="text-body text-ink">{label}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBaseline(iso, value - 1)}
                  aria-label={`Lower ${label} baseline`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-body-l text-ink outline-none transition-colors hover:border-ink-muted focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                >
                  −
                </button>
                <span className="w-8 text-center font-mono text-body-l tabular-nums text-ink">{value}</span>
                <button
                  type="button"
                  onClick={() => setBaseline(iso, value + 1)}
                  aria-label={`Raise ${label} baseline`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-body-l text-ink outline-none transition-colors hover:border-ink-muted focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </Panel>

      <p className="text-body-s text-ink-muted">
        Applies to days from now on. A day already started keeps the standard it was given — changing tonight
        never rewrites whether last Tuesday was won.
      </p>
    </div>
  );
}
