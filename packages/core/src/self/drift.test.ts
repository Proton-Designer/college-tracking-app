import { describe, expect, it } from 'vitest';
import {
  DISTRACTED_HOUR_THRESHOLD,
  DORMANT_DAYS,
  MIN_DAYS_BETWEEN_CONFRONTATIONS,
  MIT_RECROWN_THRESHOLD,
  TRIGGER_LABELS,
  detectDormantDimensions,
  detectHourSignals,
  detectRecrownedMits,
  detectUnderBaselineDays,
  selectConfrontation,
  type DriftDimension,
  type DriftSignal,
} from './drift';

const TODAY = '2026-08-30';

function dimension(over: Partial<DriftDimension> = {}): DriftDimension {
  return {
    id: 1,
    name: 'Focus',
    driftStatement: "I am thirty-five and I still cannot finish anything I start.",
    alertsEnabled: true,
    lastActDate: '2026-08-29',
    ...over,
  };
}

const SIGNAL: DriftSignal = {
  trigger: 'distracted_hour',
  dimensionId: 1,
  evidence: 'that Hour ended with 9 distractions',
  evidenceData: { distractions: 9, sessionId: 7 },
};

describe('selectConfrontation — the gates that keep it quiet', () => {
  const base = {
    dimensions: [dimension()],
    signals: [SIGNAL],
    today: TODAY,
    lastConfrontationDate: null,
    enabled: true,
  };

  it('fires when everything lines up', () => {
    const offer = selectConfrontation(base);
    expect(offer).not.toBeNull();
    expect(offer!.dimensionName).toBe('Focus');
    expect(offer!.trigger).toBe('distracted_hour');
  });

  it('shows the user’s own words, unchanged', () => {
    // The whole feature. The app supplies timing; the sentence is theirs, verbatim.
    const statement = "I am thirty-five and I still cannot finish anything I start.";
    const offer = selectConfrontation({ ...base, dimensions: [dimension({ driftStatement: statement })] });
    expect(offer!.statement).toBe(statement);
  });

  it('always carries both doors, so a surface cannot render the confrontation alone', () => {
    // Confrontation then path back, never confrontation alone. Present as data precisely so this
    // cannot be forgotten in a component.
    expect(selectConfrontation(base)!.doors).toEqual(['start_hour', 'crown_tomorrow']);
  });

  it('carries checkable evidence rather than an assertion about the person', () => {
    const offer = selectConfrontation(base)!;
    expect(offer.evidence).toBe('that Hour ended with 9 distractions');
    expect(offer.evidenceData).toEqual({ distractions: 9, sessionId: 7 });
  });

  it('stays silent inside the rate limit', () => {
    // Rarity is the mechanism. Something that fires daily is a notification people learn to
    // dismiss, which would destroy the one thing this has: that the words are theirs.
    const twoDaysAgo = '2026-08-28';
    expect(selectConfrontation({ ...base, lastConfrontationDate: twoDaysAgo })).toBeNull();
    expect(MIN_DAYS_BETWEEN_CONFRONTATIONS).toBe(3);
  });

  it('fires again once the limit has passed', () => {
    expect(selectConfrontation({ ...base, lastConfrontationDate: '2026-08-27' })).not.toBeNull();
  });

  it('stays silent when the user turned it off for that dimension', () => {
    expect(selectConfrontation({ ...base, dimensions: [dimension({ alertsEnabled: false })] })).toBeNull();
  });

  it('stays silent when the user turned it off entirely', () => {
    expect(selectConfrontation({ ...base, enabled: false })).toBeNull();
  });

  it('stays silent when there is no written statement — the statement IS the opt-in', () => {
    expect(selectConfrontation({ ...base, dimensions: [dimension({ driftStatement: null })] })).toBeNull();
    expect(selectConfrontation({ ...base, dimensions: [dimension({ driftStatement: '   ' })] })).toBeNull();
  });

  it('stays silent when nothing triggered', () => {
    expect(selectConfrontation({ ...base, signals: [] })).toBeNull();
  });

  it('never generates language about the user', () => {
    // Everything user-facing on the offer is either their own sentence or a stated fact. There is
    // no field a judgement could be written into.
    const offer = selectConfrontation(base)!;
    const keys = Object.keys(offer).sort();
    expect(keys).toEqual([
      'dimensionId', 'dimensionName', 'doors', 'evidence', 'evidenceData', 'statement', 'trigger',
    ]);
  });

  it('labels carry no adjective and no verdict', () => {
    // The emotional weight is supposed to come entirely from the user's own sentence underneath.
    for (const label of Object.values(TRIGGER_LABELS)) {
      expect(label.toLowerCase()).toContain('you wrote this');
    }
  });
});

describe('detectHourSignals', () => {
  const hour = {
    sessionId: 7,
    dimensionId: 1,
    distractions: 0,
    status: 'completed' as const,
    hasDeliverable: true,
    date: TODAY,
  };

  it('fires on a heavily distracted Hour', () => {
    const signals = detectHourSignals([{ ...hour, distractions: DISTRACTED_HOUR_THRESHOLD }]);
    expect(signals[0]!.trigger).toBe('distracted_hour');
  });

  it('does not fire on an ordinary bad Hour', () => {
    // A few distractions is a Tuesday. Confronting someone over it would make the mechanic noise.
    expect(detectHourSignals([{ ...hour, distractions: 3 }])).toEqual([]);
  });

  it('fires on an Hour abandoned with nothing produced', () => {
    const signals = detectHourSignals([{ ...hour, status: 'abandoned', hasDeliverable: false }]);
    expect(signals[0]!.trigger).toBe('abandoned_hour');
  });

  it('does not fire on an abandoned Hour that still produced something', () => {
    expect(detectHourSignals([{ ...hour, status: 'abandoned', hasDeliverable: true }])).toEqual([]);
  });

  it('ignores an Hour that routes to no dimension', () => {
    expect(detectHourSignals([{ ...hour, dimensionId: null, distractions: 20 }])).toEqual([]);
  });
});

describe('detectDormantDimensions', () => {
  it('fires once a dimension has been quiet long enough', () => {
    const signals = detectDormantDimensions(
      [dimension({ lastActDate: '2026-08-01' })],
      TODAY,
    );
    expect(signals[0]!.trigger).toBe('dimension_dormant');
    expect(signals[0]!.evidence).toContain('29 days');
  });

  it('does not fire on a merely quiet week', () => {
    expect(detectDormantDimensions([dimension({ lastActDate: '2026-08-25' })], TODAY)).toEqual([]);
    expect(DORMANT_DAYS).toBe(14);
  });

  it('NEVER fires on a dimension that has never had an act', () => {
    // Someone who wrote a drift statement yesterday is at the beginning, not adrift. Firing here
    // would be the app punishing a person for starting.
    expect(detectDormantDimensions([dimension({ lastActDate: null })], TODAY)).toEqual([]);
  });
});

describe('detectRecrownedMits', () => {
  it('fires on the task you keep meaning to do', () => {
    const signals = detectRecrownedMits([
      { taskId: 3, title: 'Draft the essay', dimensionId: 1, consecutiveCrownings: MIT_RECROWN_THRESHOLD },
    ]);
    expect(signals[0]!.evidence).toContain('"Draft the essay"');
    expect(signals[0]!.evidence).toContain('3 nights running');
  });

  it('does not fire on a second night', () => {
    expect(
      detectRecrownedMits([{ taskId: 3, title: 'Draft', dimensionId: 1, consecutiveCrownings: 2 }]),
    ).toEqual([]);
  });
});

describe('detectUnderBaselineDays', () => {
  it('fires on a day that closed under its own baseline', () => {
    const signals = detectUnderBaselineDays([
      { date: '2026-08-29', hoursCompleted: 1, baseline: 4, dimensionId: 1 },
    ]);
    expect(signals[0]!.evidence).toBe('1 of 4 Hours on 2026-08-29');
  });

  it('NEVER fires on a zero baseline', () => {
    // A rest day the user defined is not drift. Treating it as one would punish someone for
    // keeping their own schedule -- the same rule Day Won already follows.
    expect(
      detectUnderBaselineDays([{ date: '2026-08-29', hoursCompleted: 0, baseline: 0, dimensionId: 1 }]),
    ).toEqual([]);
  });

  it('does not fire on a day that met its baseline', () => {
    expect(
      detectUnderBaselineDays([{ date: '2026-08-29', hoursCompleted: 4, baseline: 4, dimensionId: 1 }]),
    ).toEqual([]);
  });
});
