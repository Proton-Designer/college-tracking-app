"use client";

import { daysBetween, MIN_EXPERIMENT_MEASUREMENTS } from "@collegeos/core";
import { useState, useTransition } from "react";
import type { ActiveExperiment } from "@/app/(app)/insights/data";
import { closeExperiment, logMeasurement } from "@/app/(app)/insights/actions";
import { Button, Input, Panel, Select, Textarea } from "@/components/ui";

/**
 * SCREEN_SPEC §7 — "days elapsed, measures being tracked, and current direction —
 * explicitly labeled provisional until complete."
 *
 * U9: this surface used to be read-only, and that was the whole bug. `createExperiment`
 * had a caller; `logExperimentMeasurement`, `scoreExperiment` and `getExperimentOutcome`
 * had none on either platform. A user could START a trial and then had no way to record a
 * single reading or close it — so the Learn step of the closed loop dead-ended, and the
 * demo account displayed "Day 8 of 7 · no measurements logged yet" indefinitely.
 *
 * The unclamped counter was the visible symptom; the missing scoring path was the disease.
 * Both are fixed here: a trial past its window reaches a real terminal state ("ready to
 * score") instead of counting up forever.
 */

/** A trial's phase, derived — never stored. `elapsed` counts days *since* the start date,
 *  so it is 0 on the day the trial starts. Humans count that as day one, hence `elapsed + 1`
 *  for display: a trial begun today reads "Day 1 of 7", not "Day 0 of 7".
 *
 *  `elapsed` can legitimately exceed the planned window — that means "overdue for scoring",
 *  which is a real state to name, not a bad number to hide. Rendering it unclamped as
 *  "Day 8 of 7" was the visible symptom of U9; the missing scoring path was the disease. */
function describeWindow(elapsed: number, total: number | null): { line: string; readyToScore: boolean } {
  if (total == null) return { line: `Day ${elapsed + 1} · no end date set`, readyToScore: false };
  if (elapsed >= total) return { line: `Window complete — ran ${total} days`, readyToScore: true };
  return { line: `Day ${elapsed + 1} of ${total}`, readyToScore: false };
}

function VerdictLine({ item }: { item: ActiveExperiment }) {
  const { experiment, measurements, outcome } = item;

  // Every branch below says WHY there is no verdict. A missing verdict rendered as a
  // neutral or zero result would be a fabricated finding — the exact failure this whole
  // feature exists to prevent.
  if (outcome) {
    const moved = outcome.movedInHypothesizedDirection ? "moved as predicted" : "moved against the prediction";
    const sign = outcome.percentChange > 0 ? "+" : "";
    return (
      <p className="text-body-s text-ink-muted">
        <span className="font-mono tabular-nums text-ink">
          {outcome.trialMeanValue.toFixed(1)}
        </span>{" "}
        vs baseline{" "}
        <span className="font-mono tabular-nums text-ink">{outcome.baselineValue.toFixed(1)}</span>{" "}
        <span className="font-mono tabular-nums">
          ({sign}
          {outcome.percentChange.toFixed(0)}%)
        </span>{" "}
        — {moved}, confidence {outcome.confidence}.
      </p>
    );
  }

  if (experiment.metric_name == null || experiment.baseline_value == null || experiment.hypothesized_direction == null) {
    return (
      <p className="text-body-s text-risk-high">
        This trial never recorded what it measures, what it started from, or which way it should move — so
        it can&apos;t be scored. Close it and start a new one with those set.
      </p>
    );
  }

  const scored = measurements.filter((m) => m.metric === experiment.metric_name);
  return (
    <p className="font-mono text-caption text-ink-faint">
      {scored.length} of {MIN_EXPERIMENT_MEASUREMENTS} readings needed before a verdict is meaningful.
    </p>
  );
}

function ExperimentCard({ item, today }: { item: ActiveExperiment; today: string }) {
  const { experiment, measurements } = item;
  const elapsed = daysBetween(experiment.start_date, today);
  const total = experiment.end_date ? daysBetween(experiment.start_date, experiment.end_date) : null;
  const { line, readyToScore } = describeWindow(elapsed, total);

  const [mode, setMode] = useState<"idle" | "log" | "close">("idle");
  const [reading, setReading] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<"completed" | "abandoned">("completed");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const metric = experiment.metric_name;
  const readingsForMetric = metric ? measurements.filter((m) => m.metric === metric).length : measurements.length;
  const loggedToday = measurements.some((m) => m.local_date === today && (!metric || m.metric === metric));

  function handleLog() {
    const value = Number(reading);
    if (reading.trim() === "" || !Number.isFinite(value)) {
      setError("Enter today's reading as a number.");
      return;
    }
    if (!metric) {
      setError("This trial has no declared measure, so a reading has nothing to attach to.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await logMeasurement({ experimentId: experiment.id, metric, value });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that reading — try again.");
        return;
      }
      setReading("");
      setMode("idle");
    });
  }

  function handleClose() {
    if (!summary.trim()) {
      setError("Say what happened — a closed trial with no finding teaches nothing.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await closeExperiment({ experimentId: experiment.id, status, outcomeSummary: summary.trim() });
      if (!result.ok) {
        setError(result.error ?? "Couldn't close that trial — try again.");
        return;
      }
      setMode("idle");
    });
  }

  return (
    <Panel className="flex flex-col gap-3">
      <p className="text-body text-ink">{experiment.hypothesis}</p>

      <p className="font-mono text-caption tabular-nums text-ink-faint">
        {line}
        {metric ? (
          <>
            {" · "}
            {metric}
            {experiment.hypothesized_direction ? ` should go ${experiment.hypothesized_direction === "increase" ? "up" : "down"}` : ""}
          </>
        ) : null}
        {readingsForMetric === 0 ? " · no readings yet" : ` · ${readingsForMetric} readings`}
      </p>

      {readyToScore ? (
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-moderate">Ready to score</p>
      ) : null}

      <VerdictLine item={item} />

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {metric ? (
            <Button variant="secondary" onClick={() => setMode("log")} disabled={loggedToday}>
              {loggedToday ? "Today's reading is in" : "Log today's reading"}
            </Button>
          ) : null}
          <Button variant={readyToScore ? "primary" : "ghost"} onClick={() => setMode("close")}>
            Score this trial
          </Button>
        </div>
      ) : null}

      {mode === "log" ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Input
              label={metric ?? "Reading"}
              type="number"
              step="any"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </div>
          <Button variant="primary" loading={isPending} onClick={handleLog}>
            Save reading
          </Button>
          <Button variant="ghost" onClick={() => setMode("idle")} disabled={isPending}>
            Cancel
          </Button>
        </div>
      ) : null}

      {mode === "close" ? (
        <div className="flex flex-col gap-3">
          <div className="w-48">
            <Select
              label="Outcome"
              value={status}
              onValueChange={(v) => setStatus(v === "abandoned" ? "abandoned" : "completed")}
              options={[
                { value: "completed", label: "Ran to completion" },
                { value: "abandoned", label: "Abandoned" },
              ]}
            />
          </div>
          <Textarea
            label="What did you actually learn?"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="The verdict above is the arithmetic. This is what it means."
          />
          <div className="flex gap-2">
            <Button variant="primary" loading={isPending} onClick={handleClose}>
              Close trial
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </Panel>
  );
}

export function ActiveExperiments({ experiments, today }: { experiments: ActiveExperiment[]; today: string }) {
  if (experiments.length === 0) {
    return <p className="text-body-s text-ink-faint">No experiments running right now.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {experiments.map((item) => (
        <li key={item.experiment.id}>
          <ExperimentCard item={item} today={today} />
        </li>
      ))}
    </ul>
  );
}
