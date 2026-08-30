import { describe, expect, it } from 'vitest';
import {
  PRIORITY_MAX,
  buildPairs,
  priorityComposite,
  scoreGoals,
  summariseEcology,
  type GoalRef,
  type PriorityScores,
  type RelationshipRecord,
} from './ecology';

const GOALS: GoalRef[] = [
  { id: 1, title: 'Ship the agency to $10k/mo' },
  { id: 2, title: 'Squat 140kg' },
  { id: 3, title: 'Finish the semester at 3.8' },
];

function scores(over: Partial<PriorityScores> = {}): PriorityScores {
  return {
    visionAlignment: 3,
    leverage: 3,
    compoundBenefit: 3,
    opportunityCost: 3,
    scoredOn: '2026-08-30',
    ...over,
  };
}

describe('buildPairs', () => {
  it('produces every unordered pair exactly once', () => {
    const pairs = buildPairs(GOALS, []);
    expect(pairs).toHaveLength(3); // 3 choose 2
    expect(pairs.map((p) => [p.a.id, p.b.id])).toEqual([[1, 2], [1, 3], [2, 3]]);
  });

  it('attaches a mark regardless of the order it was stored in', () => {
    const marks: RelationshipRecord[] = [
      { goalAId: 2, goalBId: 1, relationship: 'competing', note: 'Both want the mornings.' },
    ];
    const pair = buildPairs(GOALS, marks).find((p) => p.a.id === 1 && p.b.id === 2)!;
    expect(pair.relationship).toBe('competing');
    expect(pair.note).toBe('Both want the mornings.');
  });

  it('leaves an unmarked pair NULL, never neutral', () => {
    // D49 in the type. Neutral is an answer someone gave; unmarked is a question nobody asked, and
    // defaulting would inflate how examined a set of goals is.
    const pairs = buildPairs(GOALS, []);
    expect(pairs.every((p) => p.relationship === null)).toBe(true);
  });

  it('returns nothing for a single goal — there is no pair to relate', () => {
    expect(buildPairs([GOALS[0]!], [])).toEqual([]);
  });
});

describe('summariseEcology', () => {
  it('separates the four states and never folds unmarked into neutral', () => {
    const marks: RelationshipRecord[] = [
      { goalAId: 1, goalBId: 2, relationship: 'competing', note: null },
      { goalAId: 1, goalBId: 3, relationship: 'neutral', note: null },
    ];
    const summary = summariseEcology(buildPairs(GOALS, marks));
    expect(summary.competing).toHaveLength(1);
    expect(summary.neutral).toHaveLength(1);
    expect(summary.unmarked).toHaveLength(1);
    expect(summary.synergistic).toHaveLength(0);
    expect(summary.totalPairs).toBe(3);
  });

  it('reports the examined share rather than implying full coverage', () => {
    const marks: RelationshipRecord[] = [
      { goalAId: 1, goalBId: 2, relationship: 'synergistic', note: null },
    ];
    expect(summariseEcology(buildPairs(GOALS, marks)).examinedShare).toBeCloseTo(1 / 3);
  });

  it('reports a null share when there is nothing to relate', () => {
    // Different from having related nothing.
    expect(summariseEcology(buildPairs([GOALS[0]!], [])).examinedShare).toBeNull();
  });
});

describe('priorityComposite', () => {
  it('rises with alignment, leverage and compounding', () => {
    const low = priorityComposite(scores({ visionAlignment: 1, leverage: 1, compoundBenefit: 1 }));
    const high = priorityComposite(scores({ visionAlignment: 5, leverage: 5, compoundBenefit: 5 }));
    expect(high).toBeGreaterThan(low);
  });

  it('INVERTS opportunity cost — a costly goal ranks below an equivalent cheap one', () => {
    // The only one of the four where a high score is a reason against.
    const cheap = priorityComposite(scores({ opportunityCost: 1 }));
    const costly = priorityComposite(scores({ opportunityCost: 5 }));
    expect(cheap).toBeGreaterThan(costly);
  });

  it('spans 0 to 1 at the extremes', () => {
    const worst = priorityComposite(
      scores({ visionAlignment: 1, leverage: 1, compoundBenefit: 1, opportunityCost: 5 }),
    );
    const best = priorityComposite(
      scores({ visionAlignment: 5, leverage: 5, compoundBenefit: 5, opportunityCost: 1 }),
    );
    expect(worst).toBe(0);
    expect(best).toBe(1);
  });

  it('clamps a value outside the scale rather than exceeding the ceiling', () => {
    // A hand-edited row should not produce a composite above 1.
    const absurd = priorityComposite(
      scores({ visionAlignment: 99, leverage: 99, compoundBenefit: 99, opportunityCost: -4 }),
    );
    expect(absurd).toBe(1);
    expect(PRIORITY_MAX).toBe(5);
  });
});

describe('scoreGoals', () => {
  it('leaves an unscored goal visibly unscored rather than zero', () => {
    // An unevaluated goal is not a bad one.
    const result = scoreGoals(GOALS, new Map([[1, scores()]]));
    expect(result.find((r) => r.goal.id === 1)!.composite).toBeCloseTo(0.5);
    expect(result.find((r) => r.goal.id === 2)!.composite).toBeNull();
    expect(result.find((r) => r.goal.id === 2)!.scores).toBeNull();
  });

  it('does NOT sort — ranking would make the matrix the app’s opinion', () => {
    const result = scoreGoals(GOALS, new Map([[3, scores({ visionAlignment: 5, leverage: 5 })]]));
    expect(result.map((r) => r.goal.id)).toEqual([1, 2, 3]);
  });
});
