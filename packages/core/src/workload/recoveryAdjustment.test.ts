import { describe, expect, it } from 'vitest';
import { recoveryAdjustmentFromWhoopPct } from './recoveryAdjustment';

describe('recoveryAdjustmentFromWhoopPct', () => {
  it('anchors exactly at the WHOOP red/yellow/green boundaries', () => {
    expect(recoveryAdjustmentFromWhoopPct(33)).toBeCloseTo(0.75, 6);
    expect(recoveryAdjustmentFromWhoopPct(67)).toBeCloseTo(1.0, 6);
    expect(recoveryAdjustmentFromWhoopPct(100)).toBeCloseTo(1.1, 6);
  });

  it('interpolates linearly within the red-to-yellow band', () => {
    // midpoint of 33..67 -> midpoint of 0.75..1.00
    expect(recoveryAdjustmentFromWhoopPct(50)).toBeCloseTo(0.875, 3);
  });

  it('interpolates linearly within the yellow-to-green band', () => {
    // midpoint of 67..100 -> midpoint of 1.00..1.10
    expect(recoveryAdjustmentFromWhoopPct(83.5)).toBeCloseTo(1.05, 3);
  });

  it('never produces a cliff at a band boundary: values just below and above 67 are close', () => {
    const justBelow = recoveryAdjustmentFromWhoopPct(66.9);
    const justAbove = recoveryAdjustmentFromWhoopPct(67.1);
    expect(Math.abs(justAbove - justBelow)).toBeLessThan(0.01);
  });

  it('clamps at the 0.75 floor for recovery at or below the red threshold', () => {
    expect(recoveryAdjustmentFromWhoopPct(0)).toBeCloseTo(0.75, 6);
    expect(recoveryAdjustmentFromWhoopPct(10)).toBeCloseTo(0.75, 6);
  });

  it('clamps at the 1.10 ceiling for recovery above 100 (defensive, should not occur)', () => {
    expect(recoveryAdjustmentFromWhoopPct(120)).toBeCloseTo(1.1, 6);
  });

  it('returns the neutral 1.0 default when there is no recovery data, never a fabricated adjustment', () => {
    expect(recoveryAdjustmentFromWhoopPct(null)).toBe(1.0);
  });
});
