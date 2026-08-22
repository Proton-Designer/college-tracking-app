"use client";

import type { DecisionJournalRow } from "@collegeos/api";
import { useState, useTransition } from "react";
import { logDecisionAction, scoreDecisionAction } from "@/app/(app)/insights/actions";
import { Button, Input, Panel, Textarea } from "@/components/ui";

/**
 * U7 — the decision journal. Built in L8 (log/score/list) with no caller on either
 * platform, so an entire brief feature was unreachable.
 *
 * The brief wants a decision recorded with its reasoning and a prediction, then scored
 * later against what actually happened, so that *systematic* decision errors surface over
 * time rather than being re-litigated one at a time from memory. That is the same
 * observe-then-score shape as experiments (U9) and daily predictions — which is exactly
 * why it belongs on this screen beside them rather than on a route of its own.
 *
 * The prediction is optional and stays genuinely unset when not given. A defaulted
 * confidence would be a fabricated one, and this feature exists to measure precisely that.
 */

function formatDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

function ScoreForm({ decisionId, onDone }: { decisionId: number; onDone: () => void }) {
  const [actual, setActual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!actual.trim()) {
      setError("Say what actually happened.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await scoreDecisionAction({ decisionId, actualOutcome: actual.trim() });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that — try again.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea label="What actually happened?" value={actual} onChange={(e) => setActual(e.target.value)} rows={2} />
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" loading={isPending} onClick={submit}>
          Score it
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function DecisionRow({ row }: { row: DecisionJournalRow }) {
  const [scoring, setScoring] = useState(false);
  const scored = row.scored_at != null;

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body text-ink">{row.decision}</p>
        <span className="shrink-0 font-mono text-caption tabular-nums text-ink-faint">{formatDate(row.local_date)}</span>
      </div>

      {row.rationale ? <p className="text-body-s text-ink-muted">{row.rationale}</p> : null}

      {/* Prediction and confidence are shown only when they exist. A decision logged
          without a prediction is a real, allowed case — rendering "0%" for it would
          invent a certainty the user never expressed. */}
      {row.predicted_outcome || row.prediction_pct != null ? (
        <p className="font-mono text-caption text-ink-faint">
          Predicted
          {row.predicted_outcome ? `: ${row.predicted_outcome}` : ""}
          {row.prediction_pct != null ? ` · ${Math.round(Number(row.prediction_pct))}% confident` : ""}
        </p>
      ) : null}

      {scored ? (
        <p className="text-body-s text-ink">
          <span className="font-mono text-caption uppercase tracking-[0.1em] text-accent">Outcome</span>{" "}
          {row.actual_outcome}
        </p>
      ) : scoring ? (
        <ScoreForm decisionId={row.id} onDone={() => setScoring(false)} />
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setScoring(true)}>
            Score this
          </Button>
        </div>
      )}
    </Panel>
  );
}

function LogForm({ onDone }: { onDone: () => void }) {
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [predictedOutcome, setPredictedOutcome] = useState("");
  const [confidence, setConfidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!decision.trim()) {
      setError("What did you decide?");
      return;
    }
    const pct = confidence.trim() === "" ? null : Number(confidence);
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError("Confidence is a percentage between 0 and 100.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await logDecisionAction({
        decision: decision.trim(),
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
        ...(predictedOutcome.trim() ? { predictedOutcome: predictedOutcome.trim() } : {}),
        ...(pct != null ? { predictionPct: pct } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't log that — try again.");
        return;
      }
      setDecision("");
      setRationale("");
      setPredictedOutcome("");
      setConfidence("");
      onDone();
    });
  }

  return (
    <Panel className="flex flex-col gap-3">
      <Textarea
        label="The decision"
        value={decision}
        onChange={(e) => setDecision(e.target.value)}
        rows={2}
        placeholder="Dropping the second lab section to protect CHEM 255 study time"
      />
      <Textarea
        label="Why (your reasoning at the time)"
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        rows={2}
        placeholder="Recorded now, before the outcome is known — that's the point."
      />
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[16rem] flex-1">
          <Input
            label="What you expect to happen"
            value={predictedOutcome}
            onChange={(e) => setPredictedOutcome(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Input
            label="Confidence (%)"
            type="number"
            min={0}
            max={100}
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            placeholder="optional"
          />
        </div>
      </div>
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" loading={isPending} onClick={submit}>
          Log decision
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

export function DecisionJournal({ decisions }: { decisions: DecisionJournalRow[] }) {
  const [logging, setLogging] = useState(false);
  const unscored = decisions.filter((d) => d.scored_at == null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-body-s text-ink-muted">
          {decisions.length === 0
            ? "Record a real decision with your reasoning and what you expect. Score it later, and systematic errors start to show."
            : `${unscored} still waiting on an outcome.`}
        </p>
        {!logging ? (
          <Button variant="secondary" onClick={() => setLogging(true)}>
            Log a decision
          </Button>
        ) : null}
      </div>

      {logging ? <LogForm onDone={() => setLogging(false)} /> : null}

      {decisions.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {decisions.map((row) => (
            <li key={row.id}>
              <DecisionRow row={row} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
