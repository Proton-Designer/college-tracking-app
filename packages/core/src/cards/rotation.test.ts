import { describe, expect, it } from 'vitest';
import { pickRotation, type RotationCard } from './rotation';

const card = (id: number, type: RotationCard['type'], weight = 1): RotationCard => ({
  id,
  type,
  text: `card-${id}`,
  weight,
});

/** Deterministic stand-in for Math.random, so rotation can actually be asserted on. */
const sequence = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
};

describe('pickRotation', () => {
  const full = [
    card(1, 'goal'),
    card(2, 'motivation'),
    card(3, 'thought_habit'),
    card(4, 'trait'),
    card(5, 'tenx'),
  ];

  it('picks one card per slot, in the blueprint order', () => {
    const picked = pickRotation(full, sequence([0]));
    expect(picked).toHaveLength(3);
    expect(picked[0]!.type).toBe('goal');
    expect(picked[1]!.type).toBe('motivation');
    expect(['thought_habit', 'trait']).toContain(picked[2]!.type);
  });

  it('never puts the 10X card in a rotation slot', () => {
    const picked = pickRotation(full, sequence([0.99]));
    expect(picked.some((c) => c.type === 'tenx')).toBe(false);
  });

  it('lets thought_habit and trait share the third slot', () => {
    const first = pickRotation(full, sequence([0]));
    const second = pickRotation(full, sequence([0.99]));
    const thirdTypes = new Set([first[2]!.type, second[2]!.type]);
    expect(thirdTypes.size).toBe(2);
  });

  it('returns a shorter rotation rather than padding when a slot is empty', () => {
    const picked = pickRotation([card(1, 'goal'), card(2, 'motivation')], sequence([0]));
    expect(picked).toHaveLength(2);
    expect(picked.every((c) => c.type !== 'thought_habit' && c.type !== 'trait')).toBe(true);
  });

  it('returns nothing at all for an empty library, rather than placeholder content', () => {
    expect(pickRotation([], sequence([0]))).toEqual([]);
  });

  it('excludes weight-0 cards entirely instead of giving them a vanishing chance', () => {
    const cards = [card(1, 'goal', 0), card(2, 'goal', 1)];
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickRotation(cards, sequence([r]))[0]!.id).toBe(2);
    }
  });

  it('returns nothing for a slot where every card is weight 0', () => {
    expect(pickRotation([card(1, 'goal', 0)], sequence([0.5]))).toEqual([]);
  });

  it('respects weighting -- a heavier card wins across most of the range', () => {
    const cards = [card(1, 'goal', 9), card(2, 'goal', 1)];
    const lowEnd = pickRotation(cards, sequence([0.1]))[0]!.id;
    const highEnd = pickRotation(cards, sequence([0.95]))[0]!.id;
    expect(lowEnd).toBe(1);
    expect(highEnd).toBe(2);
  });
});
