import { describe, expect, it } from 'vitest';
import { clampEscalationToOptIn, evaluateEscalation } from './escalationLadder';

describe('evaluateEscalation', () => {
  it('does not escalate on a single relapse -- "do not begin with punishment"', () => {
    const result = evaluateEscalation({ currentLevel: 'l0_reminder', relapsesSinceLevelSet: 1 });
    expect(result.shouldEscalate).toBe(false);
    expect(result.recommendedNextLevel).toBeNull();
  });

  it('escalates once relapses since the level was set cross the threshold', () => {
    const result = evaluateEscalation({ currentLevel: 'l0_reminder', relapsesSinceLevelSet: 3 });
    expect(result.shouldEscalate).toBe(true);
    expect(result.recommendedNextLevel).toBe('l1_stronger_notification');
    expect(result.reason).toContain('3 relapses');
  });

  it('recommends exactly one step up the ladder at a time, never skipping levels', () => {
    const result = evaluateEscalation({ currentLevel: 'l2_distraction_block', relapsesSinceLevelSet: 5 });
    expect(result.recommendedNextLevel).toBe('l3_accountability_partner');
  });

  it('never recommends escalating past l4 -- already at the ceiling', () => {
    const result = evaluateEscalation({ currentLevel: 'l4_consequence', relapsesSinceLevelSet: 100 });
    expect(result.shouldEscalate).toBe(false);
    expect(result.recommendedNextLevel).toBeNull();
  });

  it('respects a custom relapse threshold', () => {
    const result = evaluateEscalation({ currentLevel: 'l0_reminder', relapsesSinceLevelSet: 2, minRelapsesToEscalate: 2 });
    expect(result.shouldEscalate).toBe(true);
  });
});

describe('clampEscalationToOptIn', () => {
  it('allows the recommendation through when it is within what the habit has opted into', () => {
    expect(clampEscalationToOptIn('l1_stronger_notification', 'l2_distraction_block')).toBe('l1_stronger_notification');
    expect(clampEscalationToOptIn('l2_distraction_block', 'l2_distraction_block')).toBe('l2_distraction_block');
  });

  it('blocks a recommendation past the habit\'s opt-in ceiling -- "levels 2-4 are opt-in per behavior"', () => {
    // Default ceiling is l1 (migration 0016) -- a habit that never opted in cannot be
    // pushed to l2 by evidence alone, no matter how strong.
    expect(clampEscalationToOptIn('l2_distraction_block', 'l1_stronger_notification')).toBeNull();
    expect(clampEscalationToOptIn('l4_consequence', 'l1_stronger_notification')).toBeNull();
  });
});
