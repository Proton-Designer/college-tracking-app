import type { ReactNode } from "react";
import { ActiveExperiments } from "@/components/insights/ActiveExperiments";
import { DecisionJournal } from "@/components/insights/DecisionJournal";
import { BounceBackSection } from "@/components/insights/BounceBackSection";
import { CalibrationTable } from "@/components/insights/CalibrationTable";
import { FrictionDistributionSection } from "@/components/insights/FrictionDistributionSection";
import { InsightsList } from "@/components/insights/InsightsList";
import { PlanningExecutionQuadrant } from "@/components/insights/PlanningExecutionQuadrant";
import { PageHeader } from "@/components/ui";
import { loadInsightsData } from "./data";

/**
 * L13.1 composition. This screen was six repetitions of the same hand-written section
 * markup in one undifferentiated column — every readout given identical weight, at full
 * page width, so a 1440px viewport got very long lines and no sense of what mattered.
 *
 * Two changes, both from docs/L13_DESIGN_PASS.md:
 *
 * 1. One `Section` component instead of six copies, so the rhythm lives in a single place
 *    and the next section added inherits it rather than reinventing it. The hairline above
 *    each heading is the "layered hairlines, not shadows" rule from the ratified direction.
 *
 * 2. The four analytical readouts pair into two columns at >=1280px. They are independent
 *    of each other and none needs full width, so side-by-side both shortens the scroll and
 *    fixes the unmanaged line length. The three interactive sections above stay full-width:
 *    they contain forms, and a form in a half-width column on a wide screen reads as an
 *    afterthought.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-6">
      <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

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

  const {
    today,
    insightsByTier,
    activeExperiments,
    calibrationTable,
    frictionDistribution,
    frictionTrend,
    bounceBackByHabit,
    planningExecution,
    decisions,
  } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-10">
      <PageHeader title="Insights" context="Last 30 days" />

      <InsightsList insightsByTier={insightsByTier} />

      {/* Observe-then-score, together and above the fold: an unscored trial sitting next to
          an unscored decision is what turns closing the loop into a habit. */}
      <Section title="Active experiments">
        <ActiveExperiments experiments={activeExperiments} today={today} />
      </Section>

      <Section title="Decision journal">
        <DecisionJournal decisions={decisions} />
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Task-duration calibration">
          <CalibrationTable rows={calibrationTable} />
        </Section>

        <Section title="Friction, last 30 days">
          <FrictionDistributionSection distribution={frictionDistribution} trend={frictionTrend} />
        </Section>

        <Section title="Bounce-back">
          <BounceBackSection items={bounceBackByHabit} />
        </Section>

        <Section title="Planning vs. execution — yesterday">
          <PlanningExecutionQuadrant result={planningExecution} />
        </Section>
      </div>
    </main>
  );
}
