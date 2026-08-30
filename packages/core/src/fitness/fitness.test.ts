import { describe, expect, it } from 'vitest';
import {
  CYCLE_LENGTH_DAYS,
  MUSCLE_GROUPS,
  cycleForDate,
  cycleProgress,
  isCycleBoundary,
  volumeByMuscle,
  weekStrip,
  type ExerciseMuscles,
} from './fitness';

const ANCHOR = '2026-06-01';

describe('cycleForDate', () => {
  it('places the anchor itself on day 1 of cycle 1', () => {
    const cycle = cycleForDate(ANCHOR, ANCHOR);
    expect(cycle).toMatchObject({
      cycleNumber: 1,
      startDate: '2026-06-01',
      endDate: '2026-06-28',
      dayOfCycle: 1,
      daysLeft: 28,
    });
  });

  it('rolls to the next cycle on the 29th day, not the 28th', () => {
    expect(cycleForDate(ANCHOR, '2026-06-28').cycleNumber).toBe(1);
    expect(cycleForDate(ANCHOR, '2026-06-29')).toMatchObject({
      cycleNumber: 2,
      startDate: '2026-06-29',
      dayOfCycle: 1,
    });
  });

  it('counts days left inclusively, so the last day has one left rather than none', () => {
    expect(cycleForDate(ANCHOR, '2026-06-28').daysLeft).toBe(1);
    expect(cycleForDate(ANCHOR, '2026-06-27').daysLeft).toBe(2);
  });

  it('is unaffected by DST, having no timezone lookup to get wrong', () => {
    // US DST begins 2026-03-08. A cycle spanning it must still be exactly 28 days.
    const cycle = cycleForDate('2026-02-25', '2026-03-10');
    expect(cycle.cycleNumber).toBe(1);
    expect(cycle.startDate).toBe('2026-02-25');
    expect(cycle.endDate).toBe('2026-03-24');
  });

  it('clamps a date before the anchor rather than producing a negative cycle', () => {
    expect(cycleForDate(ANCHOR, '2026-01-01')).toMatchObject({ cycleNumber: 1, dayOfCycle: 1 });
  });

  it('degrades safely on a malformed anchor instead of throwing into the page', () => {
    // This value renders a header. A crash here would take down the whole Fitness surface.
    expect(() => cycleForDate('not-a-date', '2026-06-15')).not.toThrow();
    expect(cycleForDate('not-a-date', '2026-06-15').cycleNumber).toBeGreaterThan(0);
  });

  it('marks only the final day as a boundary', () => {
    expect(isCycleBoundary(ANCHOR, '2026-06-28')).toBe(true);
    expect(isCycleBoundary(ANCHOR, '2026-06-27')).toBe(false);
    expect(CYCLE_LENGTH_DAYS).toBe(28);
  });
});

describe('volumeByMuscle', () => {
  const bench: ExerciseMuscles = {
    id: 1,
    primaryMuscles: ['chest'],
    secondaryMuscles: ['front_delt', 'triceps'],
  };
  const row: ExerciseMuscles = { id: 2, primaryMuscles: ['back_lats'], secondaryMuscles: ['biceps'] };

  it('credits a primary mover one set and each secondary a half', () => {
    const totals = volumeByMuscle([{ exerciseId: 1, reps: 8 }], [bench]);
    expect(totals.chest).toBe(1);
    expect(totals.front_delt).toBe(0.5);
    expect(totals.triceps).toBe(0.5);
  });

  it('credits a muscle listed as both primary and secondary once, not one and a half', () => {
    // His ruling, kept: it is one movement, the primary classification wins, and the duplicate
    // secondary listing is ignored rather than added.
    const odd: ExerciseMuscles = { id: 3, primaryMuscles: ['chest'], secondaryMuscles: ['chest'] };
    expect(volumeByMuscle([{ exerciseId: 3, reps: 10 }], [odd]).chest).toBe(1);
  });

  it('accumulates across sets and exercises', () => {
    const totals = volumeByMuscle(
      [
        { exerciseId: 1, reps: 8 },
        { exerciseId: 1, reps: 8 },
        { exerciseId: 2, reps: 10 },
      ],
      [bench, row],
    );
    expect(totals.chest).toBe(2);
    expect(totals.triceps).toBe(1);
    expect(totals.back_lats).toBe(1);
    expect(totals.biceps).toBe(0.5);
  });

  it('counts a set whose reps were not recorded', () => {
    // It was performed; the count simply was not written down. Dropping it would make an
    // incompletely-logged session look like a rest day.
    expect(volumeByMuscle([{ exerciseId: 1, reps: null }], [bench]).chest).toBe(1);
  });

  it('ignores a set whose exercise is unknown rather than crediting nothing to everything', () => {
    const totals = volumeByMuscle([{ exerciseId: 999, reps: 5 }], [bench]);
    expect(Object.values(totals).every((v) => v === 0)).toBe(true);
  });

  it('returns every muscle group so a chart never has holes', () => {
    const totals = volumeByMuscle([], []);
    expect(Object.keys(totals).sort()).toEqual([...MUSCLE_GROUPS].sort());
  });
});

describe('weekStrip', () => {
  it('shows a real zero for a past day with no sets', () => {
    const days = weekStrip('2026-06-15', '2026-06-17', { '2026-06-16': 12 });
    expect(days[0]!.confirmedSets).toBe(0);
    expect(days[1]!.confirmedSets).toBe(12);
  });

  it('shows null, not zero, for a day that has not happened', () => {
    // A zero on Thursday when it is Tuesday claims Thursday was a rest day -- a measurement of
    // something that has not happened yet.
    const days = weekStrip('2026-06-15', '2026-06-16', {});
    expect(days[1]!.confirmedSets).toBe(0);
    expect(days[2]!.confirmedSets).toBeNull();
    expect(days[6]!.confirmedSets).toBeNull();
  });

  it('always returns seven days', () => {
    expect(weekStrip('2026-06-15', '2026-06-21', {})).toHaveLength(7);
  });
});

describe('cycleProgress', () => {
  const cycle = cycleForDate(ANCHOR, '2026-06-10');

  it('reports null deltas when nothing was measured', () => {
    const progress = cycleProgress([], cycle);
    expect(progress).toEqual({ first: null, latest: null, weightDeltaLb: null, waistDeltaIn: null });
  });

  it('reports null, not zero, from a single measurement', () => {
    // "No change" and "nothing to compare" are different facts, and only one of them is a result.
    const progress = cycleProgress([{ date: '2026-06-05', weightLb: 180, waistIn: 33 }], cycle);
    expect(progress.first?.date).toBe('2026-06-05');
    expect(progress.weightDeltaLb).toBeNull();
    expect(progress.waistDeltaIn).toBeNull();
  });

  it('computes the delta between the first and latest readings in the cycle', () => {
    const progress = cycleProgress(
      [
        { date: '2026-06-05', weightLb: 180, waistIn: 33 },
        { date: '2026-06-20', weightLb: 177.5, waistIn: 32.5 },
      ],
      cycle,
    );
    expect(progress.weightDeltaLb).toBe(-2.5);
    expect(progress.waistDeltaIn).toBe(-0.5);
  });

  it('ignores measurements outside the cycle window', () => {
    const progress = cycleProgress(
      [
        { date: '2026-05-01', weightLb: 200, waistIn: 40 },
        { date: '2026-06-05', weightLb: 180, waistIn: 33 },
        { date: '2026-06-20', weightLb: 179, waistIn: 33 },
        { date: '2026-08-01', weightLb: 150, waistIn: 30 },
      ],
      cycle,
    );
    expect(progress.first?.date).toBe('2026-06-05');
    expect(progress.latest?.date).toBe('2026-06-20');
    expect(progress.weightDeltaLb).toBe(-1);
  });

  it('leaves one metric null when only the other was measured at both ends', () => {
    const progress = cycleProgress(
      [
        { date: '2026-06-05', weightLb: 180, waistIn: null },
        { date: '2026-06-20', weightLb: 178, waistIn: 32 },
      ],
      cycle,
    );
    expect(progress.weightDeltaLb).toBe(-2);
    expect(progress.waistDeltaIn).toBeNull();
  });
});
