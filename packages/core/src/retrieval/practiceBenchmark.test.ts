import { describe, expect, it } from 'vitest';
import { assessPracticeBenchmark, type PracticeTestEntry } from './practiceBenchmark';

const pt = (scorePct: number, localDate = '2026-09-15'): PracticeTestEntry => ({ localDate, scorePct, timed: true });

describe('assessPracticeBenchmark', () => {
  it('refuses a verdict below the sample floor -- one practice test proves nothing', () => {
    expect(assessPracticeBenchmark([], 70)).toEqual({ kind: 'insufficientData', practiceCount: 0 });
    expect(assessPracticeBenchmark([pt(95)], 70)).toEqual({ kind: 'insufficientData', practiceCount: 1 });
  });

  it('a gap at or under the threshold is aligned, not flagged', () => {
    const verdict = assessPracticeBenchmark([pt(80), pt(84)], 75);
    expect(verdict.kind).toBe('aligned');
    if (verdict.kind === 'aligned') expect(verdict.gapPct).toBe(7);
  });

  it('practice clearly ahead of the real score flags with the 5.6 prescription', () => {
    const verdict = assessPracticeBenchmark([pt(92), pt(94)], 78);
    expect(verdict.kind).toBe('practiceInflated');
    if (verdict.kind === 'practiceInflated') {
      expect(verdict.practiceAvgPct).toBe(93);
      expect(verdict.gapPct).toBe(15);
      expect(verdict.recommendation).toContain('spacing');
    }
  });

  it('real score ABOVE practice never flags -- the rule is one-directional', () => {
    const verdict = assessPracticeBenchmark([pt(70), pt(72)], 95);
    expect(verdict.kind).toBe('aligned');
  });
});
