import { describe, expect, it } from 'vitest';
import {
  ANSWER_GRACE_MINUTES,
  DEFAULT_WINDOW_MINUTES,
  STEP_MINUTES,
  bucketAllocation,
  decrement,
  emptyAllocation,
  increment,
  resolveWindowState,
  setMinutes,
  summariseCoverage,
  unaccountedGaps,
  wastedMinutes,
  type AllocationWindow,
  type EvidenceSpan,
} from './allocation';
import { LIFE_DOMAINS } from '../domains/domains';

describe('the allocation pool', () => {
  it('starts entirely unaccounted', () => {
    expect(wastedMinutes(emptyAllocation())).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it('derives wasted rather than storing it, so it cannot be edited away', () => {
    let a = emptyAllocation();
    a = setMinutes(a, 'business', 45);
    a = setMinutes(a, 'school', 30);
    expect(wastedMinutes(a)).toBe(45);
  });

  it('increments by a step and stops at a full window without erroring', () => {
    let a = emptyAllocation();
    a = increment(a, 'deen');
    expect(a.deen).toBe(STEP_MINUTES);
    a = setMinutes(a, 'deen', DEFAULT_WINDOW_MINUTES);
    const full = increment(a, 'business');
    expect(full).toBe(a);
  });

  it('gives freed minutes back to unaccounted rather than to another domain', () => {
    let a = setMinutes(emptyAllocation(), 'work', 60);
    a = decrement(a, 'work');
    expect(a.work).toBe(45);
    expect(wastedMinutes(a)).toBe(75);
  });

  it('never lets one domain take minutes from another', () => {
    // The property that falls out of deriving wasted instead of storing it.
    let a = setMinutes(emptyAllocation(), 'business', 90);
    a = setMinutes(a, 'school', 120);
    expect(a.business).toBe(90);
    expect(a.school).toBe(30);
    expect(wastedMinutes(a)).toBe(0);
  });

  it('snaps a dragged value to the step', () => {
    expect(setMinutes(emptyAllocation(), 'fitness', 37).fitness).toBe(30);
    expect(setMinutes(emptyAllocation(), 'fitness', 38).fitness).toBe(45);
  });

  it('treats NaN as a no-op instead of corrupting the value', () => {
    // A drag handler divides by element width; width 0 is a real case (not yet laid out, hidden
    // breakpoint, mid-transition) and every clamp passes NaN through silently.
    const a = setMinutes(emptyAllocation(), 'deen', 60);
    expect(setMinutes(a, 'deen', Number.NaN)).toBe(a);
  });

  it('clamps infinities through the normal arithmetic', () => {
    expect(setMinutes(emptyAllocation(), 'deen', Infinity).deen).toBe(DEFAULT_WINDOW_MINUTES);
    expect(setMinutes(emptyAllocation(), 'deen', -Infinity).deen).toBe(0);
  });

  it('respects a non-default window length', () => {
    const a = emptyAllocation();
    expect(wastedMinutes(a, 60)).toBe(60);
    expect(setMinutes(a, 'deen', 90, 60).deen).toBe(60);
  });
});

describe('bucketAllocation -- D38', () => {
  const rows = [
    { domain: 'deen' as const, minutes: 30 },
    { domain: 'business' as const, minutes: 30 },
    { domain: 'school' as const, minutes: 30 },
    { domain: 'wasted' as const, minutes: 30 },
  ];

  it('defaults to coverage semantics: every domain is signal, only unaccounted is noise', () => {
    const totals = bucketAllocation(rows, LIFE_DOMAINS);
    expect(totals.signalMinutes).toBe(90);
    expect(totals.otherCommitmentsMinutes).toBe(0);
    expect(totals.wastedMinutes).toBe(30);
    expect(totals.signalShare).toBeCloseTo(0.75);
  });

  it('reproduces the priority lens exactly when the set is narrowed', () => {
    // Ayman's original ruling, as data for one user rather than compiled in for three.
    const totals = bucketAllocation(rows, ['deen', 'business']);
    expect(totals.signalMinutes).toBe(60);
    expect(totals.otherCommitmentsMinutes).toBe(30);
    expect(totals.wastedMinutes).toBe(30);
    expect(totals.noiseMinutes).toBe(60);
  });

  it('always splits noise, so a heavy school week never looks like a lost afternoon', () => {
    const totals = bucketAllocation(rows, ['deen', 'business']);
    expect(totals.otherCommitmentsMinutes).not.toBe(totals.wastedMinutes + totals.otherCommitmentsMinutes);
    expect(totals.noiseMinutes).toBe(totals.otherCommitmentsMinutes + totals.wastedMinutes);
  });

  it('ignores an unrecognised domain rather than miscounting a total', () => {
    const totals = bucketAllocation(
      [...rows, { domain: 'nonsense' as never, minutes: 999 }],
      LIFE_DOMAINS,
    );
    expect(totals.signalMinutes + totals.noiseMinutes).toBe(120);
  });

  it('returns a null share when nothing has been accounted for', () => {
    // 0% signal would read as "all noise" for someone who simply has not answered anything yet.
    expect(bucketAllocation([], LIFE_DOMAINS).signalShare).toBeNull();
  });
});

describe('coverage -- unknown is never a failure', () => {
  it('excludes unanswered windows from the denominator instead of scoring them', () => {
    const summary = summariseCoverage([
      { start: '', end: '', state: 'answered' },
      { start: '', end: '', state: 'answered' },
      { start: '', end: '', state: 'unknown' },
      { start: '', end: '', state: 'unknown' },
    ] as AllocationWindow[]);
    // Two answered, two never asked-and-answered: 50%, not 100% and not a penalty.
    expect(summary.coverage).toBeCloseTo(0.5);
    expect(summary.unknown).toBe(2);
  });

  it('counts evidence-prefilled windows as accounted for', () => {
    const summary = summariseCoverage([
      { start: '', end: '', state: 'prefilled' },
      { start: '', end: '', state: 'unknown' },
    ] as AllocationWindow[]);
    expect(summary.prefilled).toBe(1);
    expect(summary.coverage).toBeCloseTo(0.5);
  });

  it('is null before anything has closed', () => {
    const summary = summariseCoverage([
      { start: '', end: '', state: 'upcoming' },
      { start: '', end: '', state: 'open' },
    ] as AllocationWindow[]);
    expect(summary.coverage).toBeNull();
    expect(summary.pending).toBe(2);
  });
});

describe('resolveWindowState', () => {
  const window = { start: '2026-06-15T14:00:00Z', end: '2026-06-15T16:00:00Z' };
  const hour: EvidenceSpan = {
    start: '2026-06-15T14:30:00Z',
    end: '2026-06-15T15:30:00Z',
    domain: 'business',
    source: 'Hour — ship the pricing page',
  };

  it('lets an answer win over everything', () => {
    expect(resolveWindowState(window, true, [hour], new Date('2026-06-16T00:00:00Z'))).toBe('answered');
  });

  it('prefills only from evidence that carries its own account of the time', () => {
    expect(resolveWindowState(window, false, [hour], new Date('2026-06-15T17:00:00Z'))).toBe('prefilled');
  });

  it('walks upcoming to open to unknown as the clock passes', () => {
    expect(resolveWindowState(window, false, [], new Date('2026-06-15T13:00:00Z'))).toBe('upcoming');
    expect(resolveWindowState(window, false, [], new Date('2026-06-15T15:00:00Z'))).toBe('open');
    // Still answerable inside the grace period.
    expect(resolveWindowState(window, false, [], new Date('2026-06-15T16:20:00Z'))).toBe('open');
    expect(
      resolveWindowState(window, false, [], new Date(`2026-06-15T${16}:${ANSWER_GRACE_MINUTES + 5}:00Z`)),
    ).toBe('unknown');
  });

  it('never resolves an unanswered window to wasted', () => {
    // Deriving "wasted" from silence would let the app invent the number the person is meant to
    // confess. `unknown` is a state, not a score.
    const state = resolveWindowState(window, false, [], new Date('2026-06-20T00:00:00Z'));
    expect(state).toBe('unknown');
  });
});

describe('unaccountedGaps -- Kareem’s amendment to D33', () => {
  const windows: AllocationWindow[] = [
    { start: '2026-06-15T14:00:00Z', end: '2026-06-15T16:00:00Z', state: 'unknown' },
    { start: '2026-06-15T16:00:00Z', end: '2026-06-15T18:00:00Z', state: 'unknown' },
    { start: '2026-06-15T18:00:00Z', end: '2026-06-15T20:00:00Z', state: 'answered' },
  ];
  const now = new Date('2026-06-15T22:00:00Z');

  it('returns closed unanswered windows as visible spans to be asked about', () => {
    const gaps = unaccountedGaps(windows, [], now);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toEqual({
      start: '2026-06-15T14:00:00Z',
      end: '2026-06-15T16:00:00Z',
      minutes: 120,
    });
  });

  it('does not ask about time that already has a deliverable behind it', () => {
    const hour: EvidenceSpan = {
      start: '2026-06-15T14:15:00Z',
      end: '2026-06-15T15:15:00Z',
      domain: 'business',
      source: 'Hour — ship the pricing page',
    };
    const gaps = unaccountedGaps(windows, [hour], now);
    expect(gaps.map((g) => g.start)).toEqual(['2026-06-15T16:00:00Z']);
  });

  it('skips a window that is still being lived', () => {
    const midAfternoon = new Date('2026-06-15T15:00:00Z');
    expect(unaccountedGaps(windows, [], midAfternoon)).toEqual([]);
  });

  it('returns nothing when everything closed is accounted for -- a real and good state', () => {
    const allAnswered = windows.map((w) => ({ ...w, state: 'answered' as const }));
    expect(unaccountedGaps(allAnswered, [], now)).toEqual([]);
  });

  it('never converts a gap into an allocation on its own', () => {
    // The gap describes time; it carries no domain and no minutes assigned to anything. Turning
    // one into "wasted" is the user's answer to give, not this function's to assume.
    const gaps = unaccountedGaps(windows, [], now);
    for (const gap of gaps) {
      expect(gap).not.toHaveProperty('domain');
      expect(Object.keys(gap).sort()).toEqual(['end', 'minutes', 'start']);
    }
  });
});
