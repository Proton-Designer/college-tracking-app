import { FrictionDistributionSection } from "@/components/insights/FrictionDistributionSection";
import { PlanningExecutionQuadrant } from "@/components/insights/PlanningExecutionQuadrant";
import { claimsWithEvidence, EvidenceClaimList } from "@/components/review/EvidenceClaimList";
import { ReportHistoryList } from "@/components/review/ReportHistoryList";
import { Metric, RiskPill } from "@/components/ui";
import { loadReviewReport } from "./data";
import { LENS_NAMES } from "@collegeos/api";
import type { DeterministicNightlyReport, Intervention, LensName, NightlyAgentReportPayload } from "@collegeos/api";

function formatFullDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

const URGENCY_LABEL: Record<string, string> = { low: "LOW", medium: "MODERATE", high: "HIGH" };

const LENS_LABEL: Record<LensName, string> = {
  executive_coach: "Executive Coach",
  academic_strategist: "Academic Strategist",
  behavior_analyst: "Behavior Analyst",
  skeptic: "Skeptic",
  systems_engineer: "Systems Engineer",
  motivator: "Motivator",
  recovery_coach: "Recovery Coach",
};

export default async function ReviewReportPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid date.</p>
      </main>
    );
  }

  const result = await loadReviewReport(date);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load this report</p>
        <p className="text-body text-ink-muted">{result.error}</p>
      </main>
    );
  }

  const { payload, history } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 gap-10 px-8 py-10">
      <aside className="w-44 shrink-0">
        <p className="mb-3 font-mono text-label uppercase tracking-[0.1em] text-ink-muted">History</p>
        <ReportHistoryList history={history} currentDate={date} />
      </aside>

      <div className="min-w-0 flex-1">
        {!payload ? (
          <div className="max-w-report flex flex-col gap-3">
            <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{formatFullDate(date)}</h1>
            <p className="text-body text-ink-muted">No report was generated for this date.</p>
          </div>
        ) : (
          <ReportBody payload={payload} />
        )}
      </div>
    </main>
  );
}

function ReportBody({ payload }: { payload: NightlyAgentReportPayload }) {
  const { deterministic, analysis, note } = payload;
  // The deterministic headline/summary are generated with zero model involvement and
  // populated on every report -- the report opens with real prose on every night, not
  // just the nights the model layer ran. Analysis, when present, supersedes it with the
  // richer model-derived version.
  const headline = analysis?.headline ?? deterministic.headline;
  const objectiveSummary = analysis?.objective_summary ?? deterministic.objectiveSummary;
  const gapsToShow = [...deterministic.dataGaps, ...(analysis?.data_gaps ?? [])];
  const activeLenses = analysis
    ? LENS_NAMES.map((name) => ({ name, text: analysis.lenses[name] })).filter((lens) => lens.text.trim().length > 0)
    : [];

  return (
    <article className="flex max-w-report flex-col gap-8">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{headline}</h1>

      <p className="text-body-l font-serif text-ink">{objectiveSummary}</p>
      {!analysis && note ? <p className="font-mono text-caption text-ink-faint">{note}</p> : null}

      {analysis && claimsWithEvidence(analysis.wins).length > 0 ? (
        <Section title="Wins">
          <EvidenceClaimList claims={analysis.wins} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.failures).length > 0 ? (
        <Section title="Failures">
          <EvidenceClaimList claims={analysis.failures} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.planning_errors).length > 0 ? (
        <Section title="Planning errors">
          <EvidenceClaimList claims={analysis.planning_errors} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.behavior_patterns).length > 0 ? (
        <Section title="Behavior patterns">
          <EvidenceClaimList claims={analysis.behavior_patterns} />
        </Section>
      ) : null}

      {analysis && analysis.academic_risks.length > 0 ? (
        <Section title="Academic risks">
          <ul className="flex flex-col gap-2">
            {analysis.academic_risks.map((risk, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-body text-ink">{risk.note}</span>
                <RiskPill
                  band={risk.urgency === "high" ? "critical" : risk.urgency === "medium" ? "moderate" : "low"}
                  label={URGENCY_LABEL[risk.urgency] ?? risk.urgency.toUpperCase()}
                />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {activeLenses.length > 0 ? (
        <Section title="The lenses">
          <ul className="flex flex-col gap-5">
            {activeLenses.map((lens) => (
              <li key={lens.name} className="flex flex-col gap-1">
                <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">{LENS_LABEL[lens.name]}</span>
                <p className="text-body-l font-serif text-ink">{lens.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {analysis && analysis.tomorrow_changes.length > 0 ? (
        <Section title="Tomorrow's changes">
          <InterventionList items={analysis.tomorrow_changes} />
        </Section>
      ) : null}

      {analysis?.kill_list_intervention ? (
        <Section title="Kill-list intervention">
          <InterventionList items={[analysis.kill_list_intervention]} />
        </Section>
      ) : null}

      {gapsToShow.length > 0 ? (
        <Section title="What this report couldn't assess">
          <ul className="flex flex-col gap-1">
            {gapsToShow.map((gap, i) => (
              <li key={i} className="font-mono text-body-s text-ink-faint">
                {gap}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <hr className="border-hairline" />

      <DeterministicSections report={deterministic} />
    </article>
  );
}

function InterventionList({ items }: { items: Intervention[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={i} className="flex flex-col gap-0.5">
          <p className="text-body text-ink">{item.description}</p>
          <p className="text-body-s text-ink-muted">{item.rationale}</p>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}

/** The primary case, not a fallback: with no ANTHROPIC_API_KEY, this is what actually
 *  renders for every real date. Genuinely useful on its own -- numbers, traces, bands. */
function DeterministicSections({ report }: { report: DeterministicNightlyReport }) {
  return (
    <div className="flex flex-col gap-8">
      <Section title="The night, measured">
        <div className="flex flex-wrap gap-8">
          {report.review ? (
            <>
              <Metric label="MITs" value={`${report.review.mitsCompleted}/${report.review.mitsPlanned}`} />
              {report.review.deepWorkActualMin != null ? <Metric label="Deep work" value={report.review.deepWorkActualMin} unit="min" /> : null}
              {report.review.screenTimeMin != null ? <Metric label="Screen time" value={report.review.screenTimeMin} unit="min" /> : null}
            </>
          ) : null}
          {report.checkin ? (
            <>
              <Metric label="Energy" value={report.checkin.energy} unit="/10" />
              <Metric label="Mood" value={report.checkin.mood} unit="/10" />
            </>
          ) : null}
        </div>
        {!report.checkin && !report.review ? <p className="text-body-s text-ink-faint">No check-in or review recorded for this day.</p> : null}
      </Section>

      <Section title="Recovery Mode">
        {report.recoveryMode.triggered ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink">Triggered.</p>
            <ul className="flex flex-col gap-0.5">
              {report.recoveryMode.signals
                .filter((s) => s.active)
                .map((s) => (
                  <li key={s.key} className="font-mono text-caption text-ink-faint">
                    {s.key} ({s.points}pt, {s.class})
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <p className="text-body-s text-ink-muted">Not triggered.</p>
        )}
      </Section>

      <Section title="Planning vs. execution">
        <PlanningExecutionQuadrant result={report.planningExecution} />
      </Section>

      <Section title="Course risk">
        {report.riskAssessment.courseRisks.length === 0 ? (
          <p className="text-body-s text-ink-faint">No courses to assess.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.riskAssessment.courseRisks.map((cr) => (
              <li key={cr.courseId} className="flex items-center justify-between gap-3">
                <span className="text-body-s text-ink-muted">
                  {cr.courseCode} <span className="text-ink-faint">{cr.courseName}</span>
                </span>
                <div className="flex items-center gap-2">
                  <RiskPill band={cr.result.band} label={cr.result.band.toUpperCase()} />
                  <span className="font-mono text-body-s tabular-nums text-ink-faint">{cr.result.score}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Friction">
        <FrictionDistributionSection distribution={report.frictionToday} trend={report.frictionTrend} />
      </Section>

      <Section title="Kill list">
        {report.killLoop.length === 0 ? (
          <p className="text-body-s text-ink-faint">No active kill-list habits.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.killLoop.map((k) => (
              <li key={k.killHabitId} className="flex items-center justify-between gap-3">
                <span className="text-body-s text-ink">{k.name}</span>
                <span className="font-mono text-body-s tabular-nums text-ink-muted">
                  {k.relapsesToday > 0 ? `${k.relapsesToday} relapse today` : k.eventsToday > 0 ? "resisted today" : "no events today"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Focus sessions">
        <div className="flex flex-wrap gap-8">
          <Metric label="Sessions" value={report.focusSessions.count} />
          <Metric label="Completed" value={report.focusSessions.completedCount} />
          <Metric label="Total time" value={report.focusSessions.totalActualMin} unit="min" />
          <Metric label="Interruptions" value={report.focusSessions.totalInterruptions} />
        </div>
      </Section>
    </div>
  );
}
