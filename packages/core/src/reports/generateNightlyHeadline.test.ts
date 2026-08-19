import { describe, expect, it } from 'vitest';
import { generateNightlyHeadline } from './generateNightlyHeadline';
import type { RecoveryModeResult } from '../recovery/trigger';
import type { PlanningExecutionResult } from '../planning/planningExecutionGap';
import type { CourseRiskSummary } from '../risk/riskAssessment';
import type { DeterministicNightlyReportReview } from './nightlyReportTypes';

const NOT_TRIGGERED: RecoveryModeResult = {
  total: 0,
  triggered: false,
  signals: [],
  physiologicalTotal: 0,
  nonPhysiologicalTotal: 0,
};

const TRIGGERED_FOUR_SIGNALS: RecoveryModeResult = {
  total: 7,
  triggered: true,
  signals: [
    { key: 'lowSleep', points: 2, class: 'physiological', active: true },
    { key: 'lowWhoopRecovery', points: 1, class: 'physiological', active: true },
    { key: 'zeroMitCompletion', points: 2, class: 'execution', active: true },
    { key: 'compressedBackplan', points: 2, class: 'academic', active: true },
    { key: 'heavyCalendar', points: 1, class: 'schedule', active: false },
  ],
  physiologicalTotal: 3,
  nonPhysiologicalTotal: 4,
};

function review(overrides: Partial<DeterministicNightlyReportReview> = {}): DeterministicNightlyReportReview {
  return {
    mitsPlanned: 3,
    mitsCompleted: 0,
    deepWorkPlannedMin: 180,
    deepWorkActualMin: 20,
    screenTimeMin: 160,
    distractingTimeMin: 100,
    workoutCompleted: null,
    killListSuccessCount: null,
    killListTotal: null,
    proudText: null,
    wentWrongText: null,
    importantNoteText: null,
    ...overrides,
  };
}

function planningExecution(diagnosis: PlanningExecutionResult['diagnosis']): PlanningExecutionResult {
  return {
    executionQuality: 11,
    planningQuality: 64,
    startDelayMin: null,
    mitPlanned: 3,
    mitCompleted: 0,
    diagnosis,
  };
}

function courseRisk(overrides: Partial<CourseRiskSummary> = {}): CourseRiskSummary {
  return {
    courseId: 1,
    courseCode: 'CS 301',
    courseName: 'Systems Programming',
    result: { band: 'low', score: 10, trace: [], confidence: 'high', sampleSize: 1 },
    itemLabels: {},
    ...overrides,
  };
}

describe('generateNightlyHeadline', () => {
  it('produces the Recovery Mode day headline/summary from real inputs', () => {
    const result = generateNightlyHeadline({
      review: review(),
      recoveryMode: TRIGGERED_FOUR_SIGNALS,
      planningExecution: planningExecution('executionProblem'),
      courseRisks: [courseRisk({ result: { band: 'moderate', score: 48, trace: [], confidence: 'moderate', sampleSize: 2 } })],
    });

    expect(result.headline).toBe("The plan was realistic — the day wasn't.");
    // The headline is the claim; the summary is the evidence -- must not repeat itself.
    expect(result.objectiveSummary).not.toContain("the day wasn't");
    expect(result.objectiveSummary).toContain('0 of 3 top tasks were completed');
    expect(result.objectiveSummary).toContain('160 minutes of screen time');
    expect(result.objectiveSummary).toContain('Recovery Mode was triggered, on 4 signals.');
    expect(result.objectiveSummary).toContain('Systems Programming (CS 301) is carrying the most risk right now, at a moderate band.');
  });

  it('never mentions course risk when every course is low band', () => {
    const result = generateNightlyHeadline({
      review: review({ mitsCompleted: 1 }),
      recoveryMode: NOT_TRIGGERED,
      planningExecution: planningExecution('executionProblem'),
      courseRisks: [courseRisk()],
    });

    expect(result.objectiveSummary).not.toContain('carrying the most risk');
    expect(result.headline).not.toContain('Recovery Mode');
    expect(result.headline).toBe("The plan was realistic — the day wasn't.");
  });

  it('falls back to an honest empty-day headline when there is no review or diagnosis', () => {
    const result = generateNightlyHeadline({
      review: null,
      recoveryMode: NOT_TRIGGERED,
      planningExecution: null,
      courseRisks: [],
    });

    expect(result.headline).toBe('No review recorded for this day.');
    expect(result.objectiveSummary).toBe('No data was recorded for this day.');
  });

  it('uses singular "signal" wording for exactly one active signal', () => {
    const result = generateNightlyHeadline({
      review: null,
      recoveryMode: {
        total: 5,
        triggered: true,
        signals: [{ key: 'zeroMitCompletion', points: 2, class: 'execution', active: true }],
        physiologicalTotal: 0,
        nonPhysiologicalTotal: 2,
      },
      planningExecution: null,
      courseRisks: [],
    });

    expect(result.headline).toBe('Recovery Mode was triggered today.');
    expect(result.objectiveSummary).toContain('Recovery Mode was triggered, on 1 signal.');
    expect(result.objectiveSummary).not.toContain('1 signals');
  });

  it('picks the highest-scoring course when several carry risk', () => {
    const result = generateNightlyHeadline({
      review: review(),
      recoveryMode: NOT_TRIGGERED,
      planningExecution: planningExecution('calibrated'),
      courseRisks: [
        courseRisk({ courseId: 1, courseCode: 'CS 301', courseName: 'Systems Programming', result: { band: 'moderate', score: 40, trace: [], confidence: 'high', sampleSize: 3 } }),
        courseRisk({ courseId: 2, courseCode: 'PHYS 241', courseName: 'Modern Physics', result: { band: 'high', score: 63, trace: [], confidence: 'high', sampleSize: 2 } }),
      ],
    });

    expect(result.objectiveSummary).toContain('Modern Physics (PHYS 241) is carrying the most risk right now, at a high band.');
  });

  it('never renders a double-hyphen where an em dash belongs, in headline or summary', () => {
    // Lead review, 2026-08-19: the product is typographically deliberate (Plex Serif,
    // tabular numerals, hairline rules) -- "--" instead of "—" undercuts that.
    for (const diagnosis of ['overplanning', 'executionProblem', 'underplanning', 'calibrated'] as const) {
      const result = generateNightlyHeadline({
        review: review(),
        recoveryMode: TRIGGERED_FOUR_SIGNALS,
        planningExecution: planningExecution(diagnosis),
        courseRisks: [courseRisk({ result: { band: 'high', score: 70, trace: [], confidence: 'high', sampleSize: 2 } })],
      });
      expect(result.headline).not.toContain('--');
      expect(result.objectiveSummary).not.toContain('--');
    }
  });

  it('counts only ACTIVE signals for the Recovery Mode sentence, never the full signal-definition array length', () => {
    // Lead review, 2026-08-19: recoveryMode.signals always lists all 8 defined signals
    // (active and inactive) -- jsonb_array_length would always read 8. The sentence must
    // count the active subset explicitly, matching what the Recovery Mode panel itself
    // displays, or the report contradicts its own data on the same screen.
    const result = generateNightlyHeadline({
      review: null,
      recoveryMode: {
        total: 5,
        triggered: true,
        signals: [
          { key: 'lowSleep', points: 2, class: 'physiological', active: true },
          { key: 'lowWhoopRecovery', points: 1, class: 'physiological', active: true },
          { key: 'overdueTasks', points: 2, class: 'execution', active: false },
          { key: 'hardDeadlinesSoon', points: 2, class: 'academic', active: false },
          { key: 'missedCheckin', points: 1, class: 'execution', active: false },
          { key: 'zeroMitCompletion', points: 2, class: 'execution', active: true },
          { key: 'heavyCalendar', points: 1, class: 'schedule', active: false },
          { key: 'compressedBackplan', points: 2, class: 'academic', active: false },
        ],
        physiologicalTotal: 3,
        nonPhysiologicalTotal: 2,
      },
      planningExecution: null,
      courseRisks: [],
    });

    expect(result.objectiveSummary).toContain('Recovery Mode was triggered, on 3 signals.');
    expect(result.objectiveSummary).not.toContain('8 signals');
  });
});
