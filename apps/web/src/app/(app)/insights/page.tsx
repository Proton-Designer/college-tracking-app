import { ActiveExperiments } from "@/components/insights/ActiveExperiments";
import { BounceBackSection } from "@/components/insights/BounceBackSection";
import { CalibrationTable } from "@/components/insights/CalibrationTable";
import { FrictionDistributionSection } from "@/components/insights/FrictionDistributionSection";
import { InsightsList } from "@/components/insights/InsightsList";
import { PlanningExecutionQuadrant } from "@/components/insights/PlanningExecutionQuadrant";
import { loadInsightsData } from "./data";

export default async function InsightsPage() {
  const result = await loadInsightsData();

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load insights</p>
        <p className="text-body text-ink-muted">{result.error}</p>
      </main>
    );
  }

  const { today, insightsByTier, activeExperiments, calibrationTable, frictionDistribution, frictionTrend, bounceBackByHabit, planningExecution } =
    result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">Insights</h1>

      <InsightsList insightsByTier={insightsByTier} />

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Active experiments</h2>
        <ActiveExperiments experiments={activeExperiments} today={today} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Task-duration calibration</h2>
        <CalibrationTable rows={calibrationTable} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Friction, last 30 days</h2>
        <FrictionDistributionSection distribution={frictionDistribution} trend={frictionTrend} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Bounce-back</h2>
        <BounceBackSection items={bounceBackByHabit} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Planning vs. execution — yesterday</h2>
        <PlanningExecutionQuadrant result={planningExecution} />
      </section>
    </main>
  );
}
