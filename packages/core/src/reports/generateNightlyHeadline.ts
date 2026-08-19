// Deterministic headline + objective summary for the nightly report -- zero model
// involvement (assembleReport.ts's own governing comment: the deterministic report "must
// be genuinely useful to read with zero model involvement"). Template-based, not a
// second copy of PlanningExecutionQuadrant's panel prose (apps/web) -- that component
// describes the quadrant for its own panel; this describes the whole night for the
// opening line, and the two intentionally use different wording so the page doesn't
// repeat itself when both render on the same screen.

import type { PlanningExecutionDiagnosis, PlanningExecutionResult } from '../planning/planningExecutionGap';
import type { RecoveryModeResult } from '../recovery/trigger';
import type { CourseRiskSummary } from '../risk/riskAssessment';
import type { DeterministicNightlyReportReview } from './nightlyReportTypes';

export interface GeneratedNightlyHeadline {
  headline: string;
  objectiveSummary: string;
}

export interface GenerateNightlyHeadlineInput {
  review: DeterministicNightlyReportReview | null;
  recoveryMode: RecoveryModeResult;
  planningExecution: PlanningExecutionResult | null;
  courseRisks: CourseRiskSummary[];
}

const DIAGNOSIS_CLAUSE: Record<PlanningExecutionDiagnosis, string> = {
  overplanning: 'more was planned than the day could realistically hold',
  executionProblem: 'the plan was realistic -- the day wasn\'t',
  underplanning: 'execution outpaced what was actually planned',
  calibrated: 'planning and execution were well matched',
};

function capitalize(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

function worstCourseRisk(courseRisks: CourseRiskSummary[]): CourseRiskSummary | null {
  if (courseRisks.length === 0) return null;
  return courseRisks.reduce((worst, cr) => (cr.result.score > worst.result.score ? cr : worst));
}

export function generateNightlyHeadline(input: GenerateNightlyHeadlineInput): GeneratedNightlyHeadline {
  const metricClauses: string[] = [];
  if (input.review) {
    metricClauses.push(`${input.review.mitsCompleted} of ${input.review.mitsPlanned} MITs`);
    if (input.review.deepWorkActualMin != null) {
      metricClauses.push(`${input.review.deepWorkActualMin} minutes of deep work`);
    }
  }
  if (input.recoveryMode.triggered) {
    const activeCount = input.recoveryMode.signals.filter((s) => s.active).length;
    metricClauses.push(`Recovery Mode triggered on ${activeCount} signal${activeCount === 1 ? '' : 's'}`);
  }

  const diagnosisClause = input.planningExecution ? DIAGNOSIS_CLAUSE[input.planningExecution.diagnosis] : null;

  let headline: string;
  if (metricClauses.length === 0 && !diagnosisClause) {
    headline = 'No review recorded for this day.';
  } else if (metricClauses.length === 0) {
    headline = `${capitalize(diagnosisClause!)}.`;
  } else if (!diagnosisClause) {
    headline = `${capitalize(metricClauses.join(', '))}.`;
  } else {
    headline = `${capitalize(metricClauses.join(', '))} — ${diagnosisClause}.`;
  }

  const summarySentences: string[] = [];
  if (input.review) {
    const screenClause = input.review.screenTimeMin != null ? `, with ${input.review.screenTimeMin} minutes of screen time` : '';
    summarySentences.push(
      `${input.review.mitsCompleted} of ${input.review.mitsPlanned} top tasks were completed and ${input.review.deepWorkActualMin ?? 0} minutes of deep work were logged${screenClause}.`,
    );
  }
  if (diagnosisClause) {
    summarySentences.push(`${capitalize(diagnosisClause)}.`);
  }
  const worst = worstCourseRisk(input.courseRisks);
  if (worst && worst.result.band !== 'low') {
    summarySentences.push(`${worst.courseName} (${worst.courseCode}) is carrying the most risk right now, at a ${worst.result.band} band.`);
  } else if (input.recoveryMode.triggered) {
    summarySentences.push('No course is in immediate risk, but recovery takes priority before pushing further.');
  }

  const objectiveSummary = summarySentences.length > 0 ? summarySentences.join(' ') : 'No data was recorded for this day.';

  return { headline, objectiveSummary };
}
