"use client";

import type { Insight } from "@collegeos/api";
import { useState, useTransition } from "react";
import { runExperiment } from "@/app/(app)/insights/actions";
import { Button, Input, Select, Textarea } from "@/components/ui";
import type { InsightsByTier } from "@/app/(app)/insights/data";

const TIER_BORDER: Record<keyof InsightsByTier, string> = {
  high: "border-solid",
  medium: "border-dashed",
  testing: "border-dotted",
};

const TIER_LABEL: Record<keyof InsightsByTier, string> = {
  high: "High confidence — measured",
  medium: "Medium confidence — indicated",
  testing: "Testing — hypothesis",
};

/** SCREEN_SPEC §7 — grouped strictly by confidence tier, in this order, using the
 *  ratified line-style convention (§6.2): high solid, medium dashed, testing dotted. */
export function InsightsList({ insightsByTier }: { insightsByTier: InsightsByTier }) {
  const tiers: Array<keyof InsightsByTier> = ["high", "medium", "testing"];
  const hasAny = tiers.some((t) => insightsByTier[t].length > 0);

  if (!hasAny) {
    return <p className="text-body-s text-ink-faint">No insights yet — these build up as the semester&apos;s data accumulates.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {tiers.map((tier) =>
        insightsByTier[tier].length > 0 ? (
          <div key={tier} className="flex flex-col gap-3">
            <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{TIER_LABEL[tier]}</p>
            <ul className="flex flex-col gap-3">
              {insightsByTier[tier].map((insight) => (
                <li key={insight.id} className={`border-l-2 pl-4 ${TIER_BORDER[tier]}`} style={{ borderColor: "var(--color-ink-muted)" }}>
                  <InsightCard insight={insight} showExperimentAction={tier === "testing"} />
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

function InsightCard({ insight, showExperimentAction }: { insight: Insight; showExperimentAction: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">{insight.claim}</p>
      <p className="font-mono text-caption tabular-nums text-ink-faint">
        n={insight.sample_size}
        {insight.effect_size != null ? ` · effect ${insight.effect_size.toFixed(2)}` : ""}
      </p>
      {showExperimentAction ? (
        expanded ? (
          <RunExperimentForm insightId={insight.id} defaultHypothesis={insight.claim} onCancel={() => setExpanded(false)} />
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setExpanded(true)}>
              Run an experiment
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function RunExperimentForm({
  insightId,
  defaultHypothesis,
  onCancel,
}: {
  insightId: number;
  defaultHypothesis: string;
  onCancel: () => void;
}) {
  const [hypothesis, setHypothesis] = useState(defaultHypothesis);
  const [protocol, setProtocol] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [metricName, setMetricName] = useState("");
  const [baselineValue, setBaselineValue] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError("Enter a duration in days.");
      return;
    }
    if (!metricName.trim()) {
      setError("Name the one thing this trial measures.");
      return;
    }
    const baseline = Number(baselineValue);
    if (baselineValue.trim() === "" || !Number.isFinite(baseline)) {
      setError("Enter the measure's value now — movement needs something to move from.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runExperiment({
        insightId,
        hypothesis,
        ...(protocol.trim() ? { protocol: protocol.trim() } : {}),
        durationDays: days,
        metricName: metricName.trim(),
        baselineValue: baseline,
        hypothesizedDirection: direction,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't start that trial — try again.");
        return;
      }
      setStarted(true);
    });
  }

  if (started) {
    return <p className="text-body-s text-accent">Trial started — it&apos;ll show under Active experiments.</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline bg-surface p-4">
      <Textarea label="Hypothesis" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={2} />
      <Textarea
        label="What will you measure, and how"
        value={protocol}
        onChange={(e) => setProtocol(e.target.value)}
        rows={2}
        placeholder="e.g. log minutes distracted each day"
      />
      {/* U9: a trial with no measurable, no baseline and no predicted direction cannot be
          scored — getExperimentOutcome returns null without them. Every experiment created
          before these fields existed is permanently unscoreable, which is why the demo
          account's trial sat at "no measurements logged yet" indefinitely. */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[12rem] flex-1">
          <Input
            label="Measure"
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="minutes_distracted"
          />
        </div>
        <div className="w-32">
          <Input
            label="Its value now"
            type="number"
            step="any"
            value={baselineValue}
            onChange={(e) => setBaselineValue(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            label="Should move"
            value={direction}
            onValueChange={(v) => setDirection(v === "increase" ? "increase" : "decrease")}
            options={[
              { value: "decrease", label: "Down" },
              { value: "increase", label: "Up" },
            ]}
          />
        </div>
        <div className="w-32">
          <Input label="Duration (days)" type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" loading={isPending} onClick={handleStart}>
          Start trial
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
