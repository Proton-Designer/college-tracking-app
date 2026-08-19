import type { PlanningExecutionResult } from "@collegeos/core";
import { Metric } from "@/components/ui";

const DIAGNOSIS_PROSE: Record<PlanningExecutionResult["diagnosis"], string> = {
  overplanning: "Low planning quality and low execution — yesterday's plan didn't match reality, and what was planned didn't get done either.",
  executionProblem: "Planning was realistic, but execution fell short — the plan itself wasn't the problem.",
  underplanning: "Execution was strong against a plan that undershot real capacity — there was room for more than was planned.",
  calibrated: "Plan and execution both landed close to reality yesterday.",
};

/** SCREEN_SPEC §7 — the planning-vs-execution quadrant, DOMAIN_ENGINE_SPEC.md §8: two
 *  separate scores, deliberately not blended, so overplanning and weak execution never
 *  get averaged into one number that hides which one is actually the problem. Scoped to
 *  yesterday -- the most recent complete day with a submitted review. */
export function PlanningExecutionQuadrant({ result }: { result: PlanningExecutionResult | null }) {
  if (!result) {
    return <p className="text-body-s text-ink-faint">No review submitted yesterday to diagnose against.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-8">
        <Metric label="Execution quality" value={Math.round(result.executionQuality)} unit="%" />
        <Metric label="Planning quality" value={Math.round(result.planningQuality)} unit="%" />
        {result.startDelayMin != null ? (
          <Metric label="Start delay" value={result.startDelayMin >= 0 ? `+${result.startDelayMin}` : result.startDelayMin} unit="min" />
        ) : null}
      </div>
      <p className="text-body text-ink">{DIAGNOSIS_PROSE[result.diagnosis]}</p>
      <p className="font-mono text-caption tabular-nums text-ink-faint">
        MITs {result.mitCompleted}/{result.mitPlanned}
      </p>
    </div>
  );
}
