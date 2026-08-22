"use client";

import type { InterventionRow } from "@collegeos/api";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  dismissInterventionAction,
  markInterventionsDeliveredAction,
  respondToInterventionAction,
} from "@/app/(app)/today/interventionActions";
import { Button, Panel } from "@/components/ui";

/**
 * U1 — the interventions surface.
 *
 * "Intervene" is a step of the product's core loop (Observe → Plan → Execute → Detect
 * deviation → **Intervene** → Reflect → Learn), and until now it had no surface at all.
 * Worse than undisplayed: nothing ever *ran* the evaluators, so no intervention was ever
 * created in the real request path and the demo account held zero rows of any kind. The
 * loop was open at this step from the beginning.
 *
 * Each prompt shows what fired it, what it says, and the actions it actually offers —
 * `actions` comes from the intervention row, never from a list hardcoded here, so the
 * buttons can't drift from what the engine decided or from what the server will accept.
 */

const KIND_LABEL: Record<string, string> = {
  exception_notification: "Heads up",
  deviation_prompt: "Off plan",
  escalation_action: "Kill list",
  stale_task_prompt: "Still real?",
};

function InterventionCard({ intervention }: { intervention: InterventionRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function respond(action: string) {
    setError(null);
    startTransition(async () => {
      const result = await respondToInterventionAction({ interventionId: intervention.id, action });
      if (!result.ok) setError(result.error ?? "Couldn't record that — try again.");
    });
  }

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const result = await dismissInterventionAction({ interventionId: intervention.id });
      if (!result.ok) setError(result.error ?? "Couldn't dismiss that — try again.");
    });
  }

  return (
    <Panel className="flex flex-col gap-2">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-moderate">
        {KIND_LABEL[intervention.kind] ?? intervention.kind}
      </p>
      <p className="text-body text-ink">{intervention.message}</p>

      {/* Why this fired, stated plainly. An intervention that won't say what triggered it is
          asking for trust it hasn't earned — and the product's whole claim is that it
          argues from the record rather than from vibes. */}
      <p className="font-mono text-caption text-ink-faint">{intervention.trigger_reason}</p>

      <div className="mt-1 flex flex-wrap gap-2">
        {intervention.actions.map((action) => (
          <Button key={action} variant="secondary" onClick={() => respond(action)} disabled={isPending}>
            {action}
          </Button>
        ))}
        <Button variant="ghost" onClick={dismiss} disabled={isPending}>
          Not now
        </Button>
      </div>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </Panel>
  );
}

export function InterventionsSection({ interventions }: { interventions: InterventionRow[] }) {
  const undelivered = interventions.filter((i) => i.status === "pending").map((i) => i.id);
  // Ref-guarded so React Strict Mode's double-invoke doesn't fire two identical writes.
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || undelivered.length === 0) return;
    marked.current = true;
    void markInterventionsDeliveredAction({ interventionIds: undelivered });
  }, [undelivered]);

  if (interventions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Needs a decision</h2>
      <ul className="flex flex-col gap-3">
        {interventions.map((intervention) => (
          <li key={intervention.id}>
            <InterventionCard intervention={intervention} />
          </li>
        ))}
      </ul>
    </section>
  );
}
