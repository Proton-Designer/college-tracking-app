import { describe, expect, it } from 'vitest';
import { buildExamCurve } from './examCurve';

describe('buildExamCurve', () => {
  it('emits the full curve when the exam is 21+ days out', () => {
    const curve = buildExamCurve('2026-09-01', '2026-09-22');
    expect(curve.compressed).toBe(false);
    expect(curve.examReached).toBe(false);
    expect(curve.sessions).toEqual([
      { date: '2026-09-01', kind: 'retrieval', daysBefore: 21 },
      { date: '2026-09-08', kind: 'retrieval', daysBefore: 14 },
      { date: '2026-09-15', kind: 'practice_test', daysBefore: 7 },
      { date: '2026-09-19', kind: 'retrieval', daysBefore: 3 },
      { date: '2026-09-20', kind: 'practice_test', daysBefore: 2 },
      { date: '2026-09-21', kind: 'light_review', daysBefore: 1 },
    ]);
  });

  it('D-7 is a practice test, not a retrieval session -- the collision resolves once, in the curve', () => {
    const curve = buildExamCurve('2026-09-01', '2026-09-22');
    const d7 = curve.sessions.filter((s) => s.daysBefore === 7);
    expect(d7).toHaveLength(1);
    expect(d7[0]!.kind).toBe('practice_test');
  });

  it('clips past sessions and flags compression when the exam is close', () => {
    // 5 days out: D-21/-14/-7 are gone; D-3, D-2, D-1 remain.
    const curve = buildExamCurve('2026-09-17', '2026-09-22');
    expect(curve.compressed).toBe(true);
    expect(curve.sessions.map((s) => s.daysBefore)).toEqual([3, 2, 1]);
  });

  it('the night before, only light review remains -- never a cram block, by construction', () => {
    const curve = buildExamCurve('2026-09-21', '2026-09-22');
    expect(curve.sessions).toEqual([{ date: '2026-09-21', kind: 'light_review', daysBefore: 1 }]);
  });

  it('an exam today or past emits nothing and says why', () => {
    expect(buildExamCurve('2026-09-22', '2026-09-22')).toEqual({ sessions: [], compressed: true, examReached: true });
    expect(buildExamCurve('2026-09-23', '2026-09-22').examReached).toBe(true);
  });

  it('sessions land on real calendar dates across a month boundary', () => {
    const curve = buildExamCurve('2026-08-20', '2026-09-05');
    expect(curve.sessions.find((s) => s.daysBefore === 14)?.date).toBe('2026-08-22');
    expect(curve.sessions.find((s) => s.daysBefore === 1)?.date).toBe('2026-09-04');
  });
});
