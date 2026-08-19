import { describe, expect, it } from 'vitest';
import { composeMinimumViableDay, type MvdCandidateItem } from './mvd';

const items: MvdCandidateItem[] = [
  { id: 'submit-ps4', kind: 'hardDeadline' },
  { id: 'submit-lab-report', kind: 'hardDeadline' },
  { id: 'attend-exam', kind: 'attendance' },
  { id: 'attend-lecture', kind: 'attendance' },
  { id: 'study-bme', kind: 'studyBlock', riskScore: 82 },
  { id: 'study-chem', kind: 'studyBlock', riskScore: 40 },
  { id: 'study-phys', kind: 'studyBlock', riskScore: 61 },
  { id: 'admin-email', kind: 'other' },
  { id: 'gym', kind: 'other' },
];

describe('composeMinimumViableDay', () => {
  it('always retains every hard deadline', () => {
    const plan = composeMinimumViableDay(items, { sleepByTime: '23:45' });
    expect(plan.kept.some((i) => i.id === 'submit-ps4')).toBe(true);
    expect(plan.kept.some((i) => i.id === 'submit-lab-report')).toBe(true);
  });

  it('never rolls forward an exam or other attendance obligation', () => {
    const plan = composeMinimumViableDay(items, { sleepByTime: '23:45' });
    expect(plan.kept.some((i) => i.id === 'attend-exam')).toBe(true);
    expect(plan.kept.some((i) => i.id === 'attend-lecture')).toBe(true);
    expect(plan.deferred.some((i) => i.id === 'attend-exam')).toBe(false);
  });

  it('keeps exactly one study block: the highest risk', () => {
    const plan = composeMinimumViableDay(items, { sleepByTime: '23:45' });
    const keptStudyBlocks = plan.kept.filter((i) => i.kind === 'studyBlock');
    expect(keptStudyBlocks).toHaveLength(1);
    expect(keptStudyBlocks[0]!.id).toBe('study-bme');
  });

  it('produces a deferred list that is complete and lossless', () => {
    const plan = composeMinimumViableDay(items, { sleepByTime: '23:45' });
    const allIds = new Set([...plan.kept, ...plan.deferred].map((i) => i.id));
    expect(allIds.size).toBe(items.length);
    for (const item of items) {
      const inKept = plan.kept.some((i) => i.id === item.id);
      const inDeferred = plan.deferred.some((i) => i.id === item.id);
      expect(inKept !== inDeferred).toBe(true); // exactly one of the two, never both, never neither
    }
  });

  it('adds sleep-by and phone-block protections around the kept study block', () => {
    const plan = composeMinimumViableDay(items, { sleepByTime: '23:45' });
    expect(plan.sleepByTime).toBe('23:45');
    expect(plan.phoneBlockDuringStudyBlock).toBe(true);
  });

  it('keeps no study block when none are candidates', () => {
    const noStudy = items.filter((i) => i.kind !== 'studyBlock');
    const plan = composeMinimumViableDay(noStudy, { sleepByTime: '23:45' });
    expect(plan.kept.some((i) => i.kind === 'studyBlock')).toBe(false);
  });
});
