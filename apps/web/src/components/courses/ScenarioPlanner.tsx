"use client";

import type { CategoryResult, GradeScenarioHypothetical, RequiredScoreResult } from "@collegeos/core";
import { useState, useTransition } from "react";
import { Button, Label, Panel } from "@/components/ui";
import { runGradeScenario, runRequiredScore } from "@/app/courses/[id]/actions";

function formatPct(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`;
}

function verdictProse(result: RequiredScoreResult, targetPct: number): string {
  switch (result.verdict) {
    case "final":
      return result.metTarget
        ? `Grade is final at ${formatPct(result.finalGrade ?? 0)} — target met.`
        : `Grade is final at ${formatPct(result.finalGrade ?? 0)} — target of ${targetPct}% was not met.`;
    case "impossible":
      return `Not reachable. The best possible final grade from here is ${formatPct(result.maxAchievableGrade ?? 0)}.`;
    case "secured":
      return `Already secured — an average as low as ${formatPct(result.minRequiredToHold ?? 0)} on what's left still hits ${targetPct}%.`;
    case "onTrack":
      return `Needs an average of ${formatPct(result.neededPct)} on the remaining ${formatPct(result.remainingWeightPct)} of weight to hit ${targetPct}%.`;
  }
}

export function ScenarioPlanner({
  courseId,
  categoryResults,
  defaultTargetPct,
}: {
  courseId: number;
  categoryResults: CategoryResult[];
  defaultTargetPct: number | null;
}) {
  const unresolved = categoryResults.filter((c) => !c.resolved);

  const [targetInput, setTargetInput] = useState(String(defaultTargetPct ?? 90));
  const [requiredResult, setRequiredResult] = useState<RequiredScoreResult | null>(null);
  const [requiredError, setRequiredError] = useState<string | null>(null);
  const [isPendingRequired, startRequiredTransition] = useTransition();

  const [hypotheticalInputs, setHypotheticalInputs] = useState<Record<string, string>>({});
  const [scenarioGrade, setScenarioGrade] = useState<number | null | undefined>(undefined);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [isPendingScenario, startScenarioTransition] = useTransition();

  function handleCalculateRequired() {
    const targetPct = Number(targetInput);
    if (!Number.isFinite(targetPct)) {
      setRequiredError("Enter a number.");
      return;
    }
    setRequiredError(null);
    startRequiredTransition(async () => {
      const result = await runRequiredScore(courseId, targetPct);
      if (!result.ok) {
        setRequiredError(result.error);
        return;
      }
      setRequiredResult(result.data);
    });
  }

  function handlePreviewScenario() {
    const hypotheticals: GradeScenarioHypothetical[] = Object.entries(hypotheticalInputs)
      .filter(([, v]) => v.trim() !== "")
      .map(([categoryId, v]) => ({ categoryId, assumedPct: Number(v) }));

    if (hypotheticals.some((h) => !Number.isFinite(h.assumedPct))) {
      setScenarioError("Enter a number for each filled-in category.");
      return;
    }
    setScenarioError(null);
    startScenarioTransition(async () => {
      const result = await runGradeScenario(courseId, hypotheticals);
      if (!result.ok) {
        setScenarioError(result.error);
        return;
      }
      setScenarioGrade(result.data.projectedGrade);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="What do I need?">
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target-pct">Target grade</Label>
              <input
                id="target-pct"
                type="number"
                min={0}
                max={100}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="h-9 w-24 rounded-sm border border-border bg-surface px-2 font-mono text-body-s tabular-nums text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
              />
            </div>
            <Button variant="secondary" onClick={handleCalculateRequired} loading={isPendingRequired}>
              Calculate
            </Button>
          </div>
          {requiredError ? <p className="text-body-s text-risk-critical">{requiredError}</p> : null}
          {requiredResult ? (
            <div className="flex flex-col gap-1 border-t border-hairline pt-3">
              <p className="text-body text-ink">{verdictProse(requiredResult, Number(targetInput))}</p>
              {requiredResult.perRemainingCategory.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {requiredResult.perRemainingCategory.map((c) => (
                    <li key={c.categoryId} className="font-mono text-caption text-ink-faint">
                      Category {c.categoryId}: {formatPct(c.requiredPct)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>

      {unresolved.length > 0 ? (
        <Panel title="What if…">
          <p className="mb-3 text-body-s text-ink-faint">
            Category names aren&apos;t wired up yet — shown by id until that data lands.
          </p>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              {unresolved.map((c) => (
                <div key={c.categoryId} className="flex flex-col gap-1.5">
                  <Label htmlFor={`hyp-${c.categoryId}`}>Category {c.categoryId}</Label>
                  <input
                    id={`hyp-${c.categoryId}`}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="—"
                    value={hypotheticalInputs[c.categoryId] ?? ""}
                    onChange={(e) => setHypotheticalInputs((prev) => ({ ...prev, [c.categoryId]: e.target.value }))}
                    className="h-9 w-24 rounded-sm border border-border bg-surface px-2 font-mono text-body-s tabular-nums text-ink outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
                  />
                </div>
              ))}
            </div>
            <div>
              <Button variant="secondary" onClick={handlePreviewScenario} loading={isPendingScenario}>
                Preview
              </Button>
            </div>
            {scenarioError ? <p className="text-body-s text-risk-critical">{scenarioError}</p> : null}
            {scenarioGrade !== undefined ? (
              <p className="border-t border-hairline pt-3 text-body text-ink">
                {scenarioGrade == null ? "Still nothing to project from." : `Projected grade: ${formatPct(scenarioGrade)}`}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
