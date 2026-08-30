import type { ReactNode } from "react";
import Link from "next/link";
import { ActiveExperiments } from "@/components/insights/ActiveExperiments";
import { DecisionJournal } from "@/components/insights/DecisionJournal";
import { BounceBackSection } from "@/components/insights/BounceBackSection";
import { CalibrationTable } from "@/components/insights/CalibrationTable";
import { FrictionDistributionSection } from "@/components/insights/FrictionDistributionSection";
import { InsightsList } from "@/components/insights/InsightsList";
import { PlanningExecutionQuadrant } from "@/components/insights/PlanningExecutionQuadrant";
import { Aurora, PageHeader, Panel } from "@/components/ui";
import { ReviewForm } from "@/components/review/ReviewForm";
import { loadInsightsData } from "../insights/data";
import { loadReviewData } from "./data";

/**
 * M7 (docs/IHSAN_RECONCILIATION.md §4). Insights and Review were two destinations answering
 * the same question — "how am I doing" — so Insights is folded in here and `/insights` is now
 * a permanent redirect. One Review tab: what actually happened tonight, then what the last 30
 * days say about it. (The Wall joins this page later, per the same ruling.)
 *
 * Two halves, in that order, each introduced by a hairline + eyebrow heading (`SurfaceGroup`).
 * The hairline is the "layered hairlines, not shadows" rule from the ratified direction, the
 * same device `design/page.tsx` already uses to separate top-level groups; the eyebrow is the
 * label grammar `Section` uses one level down. Two ranks of the same mark, not a new one.
 *
 * L13.1 composition, carried over from the old Insights page unchanged — do not regress it:
 *
 * 1. One `Section` component instead of six copies, so the rhythm lives in a single place
 *    and the next section added inherits it rather than reinventing it.
 *
 * 2. The four analytical readouts pair into two columns at >=1280px. They are independent
 *    of each other and none needs full width, so side-by-side both shortens the scroll and
 *    fixes the unmanaged line length. The three interactive sections above stay full-width:
 *    they contain forms, and a form in a half-width column on a wide screen reads as an
 *    afterthought.
 *
 * Width: the page is `max-w-app` (1120px) because the two-column pairing needs it — at the
 * old `max-w-report` (720px) the xl: pair would collapse to two ~340px columns, which is the
 * regression this comment exists to prevent. The review half keeps `max-w-report` on its own
 * wrapper: it is prose and a form, and the measure that was chosen for it still applies.
 *
 * Both loaders run once, here, in parallel. Neither half's failure blanks the other — each
 * renders its own error in place, so a broken analytics query can't cost you tonight's review.
 */
function SurfaceGroup({ title, context, children }: { title: string; context?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-hairline pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink">{title}</h2>
        {context ? <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">{context}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{title}</h3>
      <Panel>{children}</Panel>
    </section>
  );
}

export default async function ReviewPage() {
  const [reviewResult, insightsResult] = await Promise.all([loadReviewData(), loadInsightsData()]);

  // Either loader can supply today; the header's report link only needs the date, and one
  // half being down is not a reason to drop a working link.
  const today = reviewResult.ok ? reviewResult.data.today : insightsResult.ok ? insightsResult.data.today : null;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      {/* §6.0 -- resting wash. Tonight's review has no deliverable-risk data loaded (it's
          scoped to MITs/friction/prose, not the risk engine), so there's no real band to
          derive here without adding a query this screen doesn't otherwise need. */}
      <Aurora />
      <PageHeader
        title="Review"
        actions={
          today ? (
            <Link href={`/review/${today}`} className="font-mono text-body-s text-accent underline underline-offset-2">
              Nightly report →
            </Link>
          ) : undefined
        }
      />

      <SurfaceGroup title="Tonight">
        <div className="flex w-full max-w-report flex-col gap-6">
          {!reviewResult.ok ? (
            <div className="flex flex-col items-start gap-3">
              <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
                Couldn&apos;t load tonight&apos;s review
              </p>
              <p className="text-body text-ink-muted">{reviewResult.error}</p>
              <Link href="/review" className="font-mono text-body-s text-accent underline underline-offset-2">
                Try again
              </Link>
            </div>
          ) : reviewResult.data.existingReview ? (
            <Panel className="flex flex-col gap-4">
              <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Already saved tonight</p>
              {reviewResult.data.existingReview.proud_text ? (
                <ReviewField label="What went well" value={reviewResult.data.existingReview.proud_text} />
              ) : null}
              {reviewResult.data.existingReview.went_wrong_text ? (
                <ReviewField label="What went wrong" value={reviewResult.data.existingReview.went_wrong_text} />
              ) : null}
              {reviewResult.data.existingReview.important_note_text ? (
                <ReviewField label="Anything important" value={reviewResult.data.existingReview.important_note_text} />
              ) : null}
              <p className="text-caption text-ink-faint">
                {reviewResult.data.existingReview.mits_planned === 0
                  ? "No MITs planned"
                  : `MITs ${reviewResult.data.existingReview.mits_completed}/${reviewResult.data.existingReview.mits_planned}`}{" "}
                ·{" "}
                {reviewResult.data.existingReview.deep_work_actual_min != null
                  ? `${reviewResult.data.existingReview.deep_work_actual_min} min deep work`
                  : "no session data"}
              </p>
              {reviewResult.data.prediction &&
              reviewResult.data.prediction.predicted_completion_pct != null &&
              reviewResult.data.prediction.actual_completion_pct != null ? (
                <p className="font-mono text-caption text-ink-faint">
                  Predicted {Math.round(reviewResult.data.prediction.predicted_completion_pct)}% · actual{" "}
                  {Math.round(reviewResult.data.prediction.actual_completion_pct)}%
                </p>
              ) : null}
            </Panel>
          ) : (
            <ReviewForm
              today={reviewResult.data.today}
              incompleteMits={reviewResult.data.incompleteMits}
              draft={reviewResult.data.draft}
              draftCompletionPct={reviewResult.data.draftCompletionPct}
              prediction={reviewResult.data.prediction}
            />
          )}
        </div>
      </SurfaceGroup>

      <SurfaceGroup title="Patterns" context="Last 30 days">
        {!insightsResult.ok ? (
          <div className="flex flex-col items-start gap-3">
            <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load insights</p>
            <p className="text-body text-ink-muted">{insightsResult.error}</p>
          </div>
        ) : (
          <>
            <Panel>
              <InsightsList insightsByTier={insightsResult.data.insightsByTier} />
            </Panel>

            {/* Observe-then-score, together and above the fold: an unscored trial sitting next to
                an unscored decision is what turns closing the loop into a habit. */}
            <Section title="Active experiments">
              <ActiveExperiments experiments={insightsResult.data.activeExperiments} today={insightsResult.data.today} />
            </Section>

            <Section title="Decision journal">
              <DecisionJournal decisions={insightsResult.data.decisions} />
            </Section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Section title="Task-duration calibration">
                <CalibrationTable rows={insightsResult.data.calibrationTable} />
              </Section>

              <Section title="Friction, last 30 days">
                <FrictionDistributionSection
                  distribution={insightsResult.data.frictionDistribution}
                  trend={insightsResult.data.frictionTrend}
                />
              </Section>

              <Section title="Bounce-back">
                <BounceBackSection items={insightsResult.data.bounceBackByHabit} />
              </Section>

              <Section title="Planning vs. execution — yesterday">
                <PlanningExecutionQuadrant result={insightsResult.data.planningExecution} />
              </Section>
            </div>
          </>
        )}
      </SurfaceGroup>
    </main>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <p className="text-body text-ink">{value}</p>
    </div>
  );
}
