import { describe, expect, it } from 'vitest';
import { deriveDayBand } from './dayBand';
import type { RiskBand } from './assignmentRisk';
import type { DeliverableRisk } from './riskAssessment';

/**
 * Only `result.band` is read by `deriveDayBand`, but the fixture is built through the real
 * `DeliverableRisk` shape rather than an `as any` cast: if the field ever moves or is renamed,
 * this file must fail to compile rather than quietly keep asserting against a stale shape.
 */
function riskWithBand(band: RiskBand): DeliverableRisk {
  return {
    deliverableId: 1,
    courseId: 1,
    courseCode: 'BME 3010',
    courseName: 'Biomechanics',
    title: 'Problem set 4',
    result: { band } as DeliverableRisk['result'],
    input: {} as DeliverableRisk['input'],
  };
}

describe('deriveDayBand', () => {
  it('returns null for an empty list — no computed risk means no atmosphere', () => {
    expect(deriveDayBand([])).toBeNull();
  });

  it('returns the only band when there is exactly one deliverable', () => {
    expect(deriveDayBand([riskWithBand('moderate')])).toBe('moderate');
  });

  it.each([
    ['low', ['low', 'low']],
    ['moderate', ['low', 'moderate', 'low']],
    ['high', ['low', 'high', 'moderate']],
    ['critical', ['critical', 'low']],
  ] as const)('takes the maximum band, not the first or last: %s', (expected, bands) => {
    expect(deriveDayBand(bands.map((b) => riskWithBand(b)))).toBe(expected);
  });

  it('is order-independent', () => {
    const ascending = ['low', 'moderate', 'high'] as const;
    const descending = ['high', 'moderate', 'low'] as const;
    expect(deriveDayBand(ascending.map(riskWithBand))).toBe(
      deriveDayBand(descending.map(riskWithBand)),
    );
  });

  /**
   * The rule that makes this a maximum rather than an average. One critical deliverable among
   * nine low ones is a critical day; an average would report it as calm, which is exactly the
   * comfortable-but-false reading the product exists to argue with.
   */
  it('lets a single critical deliverable characterise a day full of low ones', () => {
    const risks = [...Array<RiskBand>(9).fill('low'), 'critical' as const].map(riskWithBand);
    expect(deriveDayBand(risks)).toBe('critical');
  });
});
