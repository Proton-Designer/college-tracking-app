import { describe, expect, it } from 'vitest';
import { clampInsightConfidence, gateInsightConfidence, type InsightEvidenceInput } from './confidenceGate';

const strongEvidence: InsightEvidenceInput = {
  sampleSize: 25,
  effectHoldsInBothHalves: true,
  effectSize: 0.8,
  noiseFloor: 0.2,
  consistentDirection: true,
};

describe('gateInsightConfidence', () => {
  it('grants high confidence when n>=20, the effect holds in both halves, and exceeds the noise floor', () => {
    expect(gateInsightConfidence(strongEvidence)).toBe('high');
  });

  it('does not grant high confidence if the effect does not hold in both halves', () => {
    const result = gateInsightConfidence({ ...strongEvidence, effectHoldsInBothHalves: false });
    expect(result).not.toBe('high');
  });

  it('does not grant high confidence if the effect size does not exceed the noise floor', () => {
    const result = gateInsightConfidence({ ...strongEvidence, effectSize: 0.1, noiseFloor: 0.2 });
    expect(result).not.toBe('high');
  });

  it('does not grant high confidence below n=20, even with a strong consistent effect', () => {
    const result = gateInsightConfidence({ ...strongEvidence, sampleSize: 19 });
    expect(result).not.toBe('high');
  });

  it('grants medium confidence at n>=10 with a consistent direction', () => {
    const result = gateInsightConfidence({
      sampleSize: 12,
      effectHoldsInBothHalves: false,
      effectSize: 0.3,
      noiseFloor: 0.2,
      consistentDirection: true,
    });
    expect(result).toBe('medium');
  });

  it('falls back to testing below n=10 regardless of effect strength', () => {
    const result = gateInsightConfidence({
      sampleSize: 5,
      effectHoldsInBothHalves: true,
      effectSize: 0.9,
      noiseFloor: 0.1,
      consistentDirection: true,
    });
    expect(result).toBe('testing');
  });

  it('falls back to testing when the direction is inconsistent, even at high n', () => {
    const result = gateInsightConfidence({
      sampleSize: 30,
      effectHoldsInBothHalves: false,
      effectSize: 0.9,
      noiseFloor: 0.1,
      consistentDirection: false,
    });
    expect(result).toBe('testing');
  });
});

describe('clampInsightConfidence — the model can never self-upgrade', () => {
  it('clamps a model-claimed "high" down to "medium" when evidence only supports medium', () => {
    const mediumEvidence: InsightEvidenceInput = {
      sampleSize: 12,
      effectHoldsInBothHalves: false,
      effectSize: 0.3,
      noiseFloor: 0.2,
      consistentDirection: true,
    };
    expect(clampInsightConfidence('high', mediumEvidence)).toBe('medium');
  });

  it('clamps a model-claimed "medium" down to "testing" when evidence is too thin', () => {
    const weakEvidence: InsightEvidenceInput = {
      sampleSize: 4,
      effectHoldsInBothHalves: false,
      effectSize: 0.9,
      noiseFloor: 0.1,
      consistentDirection: true,
    };
    expect(clampInsightConfidence('medium', weakEvidence)).toBe('testing');
  });

  it('never forces an upgrade when the model is more conservative than the evidence allows', () => {
    expect(clampInsightConfidence('testing', strongEvidence)).toBe('testing');
  });

  it('passes through a claim that matches what the evidence supports', () => {
    expect(clampInsightConfidence('high', strongEvidence)).toBe('high');
  });
});
