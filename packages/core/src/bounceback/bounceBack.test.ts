import { describe, expect, it } from 'vitest';
import { computeBounceBack, type DayOutcome } from './bounceBack.js';
import { addDays } from '../util/date.js';

const START = '2026-08-01';

function series(outcomes: Array<DayOutcome['outcome']>): DayOutcome[] {
  return outcomes.map((outcome, i) => ({ date: addDays(START, i), outcome }));
}

describe('computeBounceBack — no data', () => {
  it('reports a perfect-but-unproven 100 with insufficient confidence', () => {
    const result = computeBounceBack([]);
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('insufficient');
  });
});

describe('computeBounceBack — never lapsed', () => {
  it('reports 100 with insufficient confidence, not a proven streak', () => {
    const result = computeBounceBack(series(['success', 'success', 'success', 'success']));
    expect(result.score).toBe(100);
    expect(result.confidence).toBe('insufficient');
    expect(result.closedEpisodeCount).toBe(0);
  });
});

describe('computeBounceBack — always lapsed', () => {
  it('reports 0, not a flattering 100, when every day has failed and none closed', () => {
    const result = computeBounceBack(series(['failure', 'failure', 'failure', 'failure', 'failure']));
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('insufficient');
    expect(result.closedEpisodeCount).toBe(0);
    expect(result.ongoingLapseDays).toBe(4);
  });
});

describe('computeBounceBack — single 1-day lapse', () => {
  it('scores 100 for a same-next-day recovery', () => {
    const result = computeBounceBack(series(['success', 'failure', 'success']));
    expect(result.closedEpisodeCount).toBe(1);
    expect(result.score).toBe(100);
  });
});

describe('computeBounceBack — the documented curve', () => {
  it('scores 61 for a 2-day recovery', () => {
    const result = computeBounceBack(series(['failure', 'failure', 'success']));
    expect(result.score).toBe(61);
  });

  it('scores 37 for a 3-day recovery', () => {
    const result = computeBounceBack(series(['failure', 'failure', 'failure', 'success']));
    expect(result.score).toBe(37);
  });

  it('scores 14 for a 5-day recovery', () => {
    const result = computeBounceBack(series(['failure', 'failure', 'failure', 'failure', 'failure', 'success']));
    expect(result.score).toBe(14);
  });
});

describe('computeBounceBack — alternating pattern', () => {
  it('scores 100 when every lapse recovers the very next day', () => {
    const result = computeBounceBack(
      series(['failure', 'success', 'failure', 'success', 'failure', 'success']),
    );
    expect(result.closedEpisodeCount).toBe(3);
    expect(result.score).toBe(100);
  });
});

describe('computeBounceBack — currently mid-lapse', () => {
  it('excludes the open episode from the score but reports it separately', () => {
    const result = computeBounceBack(
      series(['failure', 'success', 'failure', 'failure', 'failure']), // 1 closed (1-day), then open 3-day lapse
    );
    expect(result.closedEpisodeCount).toBe(1);
    expect(result.ongoingLapseDays).toBe(2);
    expect(result.score).toBe(100); // score reflects only the closed episode
  });
});

describe('computeBounceBack — trend detection', () => {
  it('detects an improving trend when recent recoveries are faster', () => {
    // recoveryDays sequence oldest->newest: 5,4,3,2,1
    const outcomes: DayOutcome['outcome'][] = [];
    for (const days of [5, 4, 3, 2, 1]) {
      for (let i = 0; i < days; i++) outcomes.push('failure');
      outcomes.push('success');
    }
    const result = computeBounceBack(series(outcomes));
    expect(result.trend).toBe('improving');
    expect(result.trendDelta).toBeLessThan(0);
  });

  it('detects a worsening trend when recent recoveries are slower', () => {
    const outcomes: DayOutcome['outcome'][] = [];
    for (const days of [1, 2, 3, 4, 5]) {
      for (let i = 0; i < days; i++) outcomes.push('failure');
      outcomes.push('success');
    }
    const result = computeBounceBack(series(outcomes));
    expect(result.trend).toBe('worsening');
    expect(result.trendDelta).toBeGreaterThan(0);
  });
});

describe('computeBounceBack — gaps in the day series', () => {
  it('does not silently treat untracked days as a recovery', () => {
    // failure, untracked, untracked, success -> the lapse spans all 4 days, not 1.
    const result = computeBounceBack(series(['failure', 'untracked', 'untracked', 'success']));
    expect(result.closedEpisodeCount).toBe(1);
    // recoveryDays = daysBetween(day0, day3) = 3
    expect(result.score).toBe(Math.round(100 * Math.exp(-(3 - 1) / 2)));
  });
});
