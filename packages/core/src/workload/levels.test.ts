import { describe, expect, it } from 'vitest';
import { computeWorkloadLevels, type WorkloadItem } from './levels.js';

describe('computeWorkloadLevels — floor', () => {
  it('always includes hard deadlines and attendance, computed not chosen', () => {
    const items: WorkloadItem[] = [
      { id: 'submit', kind: 'hardDeadline', estimatedMinutes: 30 },
      { id: 'class', kind: 'attendance', estimatedMinutes: 50 },
      { id: 'extra-study', kind: 'discretionary', estimatedMinutes: 60, riskReduction: 10 },
    ];
    const levels = computeWorkloadLevels(items, 200);
    expect(levels.floorItems.map((i) => i.id).sort()).toEqual(['class', 'submit']);
    expect(levels.floorMinutes).toBe(80);
  });

  it('flags plainly when the floor itself exceeds capacity', () => {
    const items: WorkloadItem[] = [
      { id: 'submit', kind: 'hardDeadline', estimatedMinutes: 300 },
    ];
    const levels = computeWorkloadLevels(items, 100);
    expect(levels.floorExceedsCapacity).toBe(true);
  });

  it('does not flag when the floor fits within capacity', () => {
    const items: WorkloadItem[] = [{ id: 'submit', kind: 'hardDeadline', estimatedMinutes: 50 }];
    const levels = computeWorkloadLevels(items, 100);
    expect(levels.floorExceedsCapacity).toBe(false);
  });
});

describe('computeWorkloadLevels — target', () => {
  it('fills remaining capacity by risk reduction per calibrated minute, not raw risk', () => {
    const items: WorkloadItem[] = [
      { id: 'low-value-long', kind: 'discretionary', estimatedMinutes: 100, riskReduction: 20 }, // 0.20/min
      { id: 'high-value-short', kind: 'discretionary', estimatedMinutes: 30, riskReduction: 21 }, // 0.70/min
    ];
    // capacity=100: high-value-short (0.70/min) should be picked first even though its raw
    // riskReduction (21) is barely more than low-value-long's (20).
    const levels = computeWorkloadLevels(items, 100);
    const targetDiscretionary = levels.targetItems.filter((i) => i.kind === 'discretionary');
    expect(targetDiscretionary.map((i) => i.id)).toContain('high-value-short');
  });

  it('adds floor minutes plus selected discretionary items to targetMinutes', () => {
    const items: WorkloadItem[] = [
      { id: 'submit', kind: 'hardDeadline', estimatedMinutes: 30 },
      { id: 'study-a', kind: 'discretionary', estimatedMinutes: 40, riskReduction: 30 },
      { id: 'study-b', kind: 'discretionary', estimatedMinutes: 40, riskReduction: 10 },
    ];
    const levels = computeWorkloadLevels(items, 80); // floor(30) + one 40-min item fits, not both
    expect(levels.targetMinutes).toBe(70); // 30 + 40 (study-a, higher ratio)
    expect(levels.targetItems.some((i) => i.id === 'study-a')).toBe(true);
    expect(levels.targetItems.some((i) => i.id === 'study-b')).toBe(false);
  });
});

describe('computeWorkloadLevels — stretch', () => {
  it('places leftover discretionary items beyond target capacity into stretch', () => {
    const items: WorkloadItem[] = [
      { id: 'study-a', kind: 'discretionary', estimatedMinutes: 40, riskReduction: 30 },
      { id: 'study-b', kind: 'discretionary', estimatedMinutes: 40, riskReduction: 10 },
    ];
    const levels = computeWorkloadLevels(items, 40);
    expect(levels.stretchItems.map((i) => i.id)).toEqual(['study-b']);
  });

  it('is explicitly optional: never included in targetMinutes', () => {
    const items: WorkloadItem[] = [{ id: 'study-a', kind: 'discretionary', estimatedMinutes: 999, riskReduction: 1 }];
    const levels = computeWorkloadLevels(items, 10);
    expect(levels.stretchItems).toHaveLength(1);
    expect(levels.targetMinutes).toBe(0);
  });
});
