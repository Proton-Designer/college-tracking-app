import { describe, expect, it } from 'vitest';
import { computePlanningExecutionGap, type PlanningExecutionInput } from './planningExecutionGap';

const base: PlanningExecutionInput = {
  plannedDeepWorkMin: 180,
  actualDeepWorkMin: 180,
  historicalCapacityP50Min: 180,
  plannedStartMin: 16 * 60,
  actualStartMin: 16 * 60,
  mitPlanned: 3,
  mitCompleted: 3,
};

describe('computePlanningExecutionGap — quadrants', () => {
  it('diagnoses overplanning: low execution, low planning quality', () => {
    // plan far above realistic capacity, and actual falls well short of the (unrealistic) plan
    const result = computePlanningExecutionGap({
      ...base,
      plannedDeepWorkMin: 400,
      actualDeepWorkMin: 100,
      historicalCapacityP50Min: 150,
    });
    expect(result.executionQuality).toBeLessThan(50);
    expect(result.planningQuality).toBeLessThan(50);
    expect(result.diagnosis).toBe('overplanning');
  });

  it('diagnoses an execution problem: low execution, high planning quality', () => {
    const result = computePlanningExecutionGap({
      ...base,
      plannedDeepWorkMin: 150,
      actualDeepWorkMin: 40,
      historicalCapacityP50Min: 150,
    });
    expect(result.executionQuality).toBeLessThan(50);
    expect(result.planningQuality).toBeGreaterThanOrEqual(50);
    expect(result.diagnosis).toBe('executionProblem');
  });

  it('diagnoses underplanning: high execution, low planning quality', () => {
    const result = computePlanningExecutionGap({
      ...base,
      plannedDeepWorkMin: 40,
      actualDeepWorkMin: 40,
      historicalCapacityP50Min: 150,
    });
    expect(result.executionQuality).toBeGreaterThanOrEqual(50);
    expect(result.planningQuality).toBeLessThan(50);
    expect(result.diagnosis).toBe('underplanning');
  });

  it('diagnoses calibrated: high execution, high planning quality', () => {
    const result = computePlanningExecutionGap({
      ...base,
      plannedDeepWorkMin: 150,
      actualDeepWorkMin: 150,
      historicalCapacityP50Min: 150,
    });
    expect(result.executionQuality).toBeGreaterThanOrEqual(50);
    expect(result.planningQuality).toBeGreaterThanOrEqual(50);
    expect(result.diagnosis).toBe('calibrated');
  });
});

describe('computePlanningExecutionGap — reported fields', () => {
  it('reports startDelayMin as actual minus planned start', () => {
    const result = computePlanningExecutionGap({ ...base, plannedStartMin: 16 * 60, actualStartMin: 16 * 60 + 67 });
    expect(result.startDelayMin).toBe(67);
  });

  it('reports negative startDelayMin for an early start', () => {
    const result = computePlanningExecutionGap({ ...base, plannedStartMin: 16 * 60, actualStartMin: 15 * 60 + 45 });
    expect(result.startDelayMin).toBe(-15);
  });

  it('passes through mitPlanned and mitCompleted', () => {
    const result = computePlanningExecutionGap({ ...base, mitPlanned: 3, mitCompleted: 2 });
    expect(result.mitPlanned).toBe(3);
    expect(result.mitCompleted).toBe(2);
  });
});

describe('computePlanningExecutionGap — division guards', () => {
  it('treats zero planned minutes as vacuously matched execution', () => {
    const result = computePlanningExecutionGap({ ...base, plannedDeepWorkMin: 0, actualDeepWorkMin: 0 });
    expect(Number.isFinite(result.executionQuality)).toBe(true);
    expect(result.executionQuality).toBe(100);
  });

  it('treats zero historical capacity as no baseline to judge planning against', () => {
    const result = computePlanningExecutionGap({ ...base, historicalCapacityP50Min: 0 });
    expect(Number.isFinite(result.planningQuality)).toBe(true);
    expect(result.planningQuality).toBe(100);
  });
});
