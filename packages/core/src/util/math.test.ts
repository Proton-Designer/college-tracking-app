import { describe, expect, it } from 'vitest';
import { clamp01 } from './math';

describe('clamp01', () => {
  it('clamps values below 0 to 0', () => {
    expect(clamp01(-5)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clamp01(5)).toBe(1);
  });

  it('passes through values already in range', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });

  it('treats exactly 0 and 1 as boundary-inclusive', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
  });
});
