import { describe, expect, it } from 'vitest';
import { computeCapacityMinutes } from './capacity';

describe('computeCapacityMinutes', () => {
  it('returns the historical p50 unchanged at neutral recovery and typical free time', () => {
    const minutes = computeCapacityMinutes({
      historicalDeepWorkP50Minutes: 200,
      recoveryAdjustment: 1.0,
      freeCalendarMinutes: 300,
      typicalFreeMinutes: 300,
    });
    expect(minutes).toBeCloseTo(200, 6);
  });

  it('scales down with less free calendar time than typical', () => {
    const minutes = computeCapacityMinutes({
      historicalDeepWorkP50Minutes: 200,
      recoveryAdjustment: 1.0,
      freeCalendarMinutes: 150,
      typicalFreeMinutes: 300,
    });
    expect(minutes).toBeCloseTo(100, 6);
  });

  it('clamps recoveryAdjustment to the [0.75, 1.10] range', () => {
    const tooLow = computeCapacityMinutes({
      historicalDeepWorkP50Minutes: 200,
      recoveryAdjustment: 0.5,
      freeCalendarMinutes: 300,
      typicalFreeMinutes: 300,
    });
    const tooHigh = computeCapacityMinutes({
      historicalDeepWorkP50Minutes: 200,
      recoveryAdjustment: 2.0,
      freeCalendarMinutes: 300,
      typicalFreeMinutes: 300,
    });
    expect(tooLow).toBeCloseTo(150, 6);
    expect(tooHigh).toBeCloseTo(220, 6);
  });

  it('treats a zero typical-free-minutes baseline as a neutral ratio rather than dividing by zero', () => {
    const minutes = computeCapacityMinutes({
      historicalDeepWorkP50Minutes: 200,
      recoveryAdjustment: 1.0,
      freeCalendarMinutes: 100,
      typicalFreeMinutes: 0,
    });
    expect(Number.isFinite(minutes)).toBe(true);
  });
});
