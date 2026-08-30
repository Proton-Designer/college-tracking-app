import { describe, expect, it } from 'vitest';
import {
  CHAIN_LAYERS_UPWARD,
  driftLine,
  isMomReviewDue,
  momCountdown,
  resolveChain,
  unanchoredCount,
  unanchoredOverWindow,
  type ChainSource,
  type MomNode,
  type WindowItem,
} from './chain';

const TODAY = '2026-08-30';

/** A complete, unbroken chain: vision -> beachhead -> mission -> M.O.M. */
const full: ChainSource = {
  vision: { id: 1, headline: 'I run a business that funds a life I actually live in.' },
  beachheads: [{ id: 10, title: 'One product paying the rent', visionId: 1 }],
  missions: [{ id: 20, title: 'First ten paying customers', beachheadId: 10 }],
  moms: [
    {
      id: 30,
      title: 'Ship the paid tier',
      missionId: 20,
      startsOn: '2026-07-01',
      endsOn: '2026-09-28',
    },
  ],
};

function item(overrides: Partial<WindowItem> = {}): WindowItem {
  return { id: 1, title: 'Email the TA', date: TODAY, momId: null, ...overrides };
}

describe('resolveChain', () => {
  it('walks an anchored item all the way to the vision', () => {
    const chain = resolveChain(full, { momId: 30 });

    expect(chain.anchored).toBe(true);
    expect(chain.via).toBe('direct');
    expect(chain.mom?.title).toBe('Ship the paid tier');
    expect(chain.mission?.title).toBe('First ten paying customers');
    expect(chain.beachhead?.title).toBe('One product paying the rent');
    expect(chain.vision?.id).toBe(1);
    expect(chain.present).toEqual([...CHAIN_LAYERS_UPWARD]);
    expect(chain.firstMissing).toBeNull();
  });

  it('treats an item anchored to nothing as unanchored, not as an error', () => {
    // D48: nullable is the ruling. An MIT with no anchor is a legitimate row, and the answer is
    // "the line starts at the M.O.M. and you have not drawn it", not a validation failure.
    const chain = resolveChain(full, { momId: null });

    expect(chain.anchored).toBe(false);
    expect(chain.via).toBeNull();
    expect(chain.present).toEqual([]);
    expect(chain.firstMissing).toBe('mom');
    expect(chain.mom).toBeNull();
  });

  it('stops at the first missing link instead of skipping it', () => {
    // A mission with no beachhead does not get to borrow the user's only beachhead. Skipping
    // would report a chain the user never drew.
    const gap: ChainSource = {
      ...full,
      missions: [{ id: 20, title: 'First ten paying customers', beachheadId: null }],
    };
    const chain = resolveChain(gap, { momId: 30 });

    expect(chain.present).toEqual(['mom', 'mission']);
    expect(chain.firstMissing).toBe('beachhead');
    expect(chain.beachhead).toBeNull();
    expect(chain.vision).toBeNull();
    // Still anchored: it reaches a M.O.M., which is the whole test for drift.
    expect(chain.anchored).toBe(true);
  });

  it('does not attach a beachhead to a superseded vision', () => {
    // The active vision is a different row than the one this beachhead was written under. The
    // link is to that older statement, so the current chain honestly stops at the beachhead.
    const rewritten: ChainSource = {
      ...full,
      vision: { id: 2, headline: 'A rewritten statement.' },
    };
    const chain = resolveChain(rewritten, { momId: 30 });

    expect(chain.present).toEqual(['mom', 'mission', 'beachhead']);
    expect(chain.firstMissing).toBe('vision');
    expect(chain.vision).toBeNull();
  });

  it('routes through the goal when the item names no M.O.M. itself', () => {
    const chain = resolveChain(full, { momId: null, goalMomId: 30 });

    expect(chain.anchored).toBe(true);
    expect(chain.via).toBe('goal');
    expect(chain.mom?.id).toBe(30);
  });

  it('prefers the direct anchor over the goal it routes through', () => {
    const two: ChainSource = {
      ...full,
      moms: [
        ...full.moms,
        { id: 31, title: 'Something else entirely', missionId: null, startsOn: null, endsOn: null },
      ],
    };
    const chain = resolveChain(two, { momId: 31, goalMomId: 30 });

    // The user said this one out loud about this item; the goal's anchor is the fallback.
    expect(chain.via).toBe('direct');
    expect(chain.mom?.id).toBe(31);
    expect(chain.firstMissing).toBe('mission');
  });

  it('reads a dangling anchor as unanchored rather than inventing a link', () => {
    // `on delete set null` means a retired parent leaves children unanchored; a filtered source
    // must not be able to resolve to something it does not contain either.
    const chain = resolveChain(full, { momId: 999 });

    expect(chain.anchored).toBe(false);
    expect(chain.firstMissing).toBe('mom');
  });
});

describe('unanchoredOverWindow', () => {
  const items: WindowItem[] = [
    item({ id: 1, title: 'Ship the pricing page', date: '2026-08-28', momId: 30 }),
    item({ id: 2, title: 'Email the TA', date: '2026-08-29', momId: null }),
    item({ id: 3, title: 'Fix the deploy', date: '2026-08-30', momId: null }),
    item({ id: 4, title: 'Call the landlord', date: '2026-08-31', momId: null }),
    item({ id: 5, title: 'Draft the deck', date: '2026-08-20', momId: null }),
  ];

  it('counts and names the items that trace to nothing, inside the window only', () => {
    const report = unanchoredOverWindow(items, full, '2026-08-25', TODAY);

    expect(report.considered).toBe(3);
    expect(report.unanchored).toBe(2);
    // Most recent first, and always nameable — a count nobody can open is a verdict.
    expect(report.items.map((i) => i.title)).toEqual(['Fix the deploy', 'Email the TA']);
  });

  it('reports an empty window as nothing to say, not as zero drift', () => {
    const report = unanchoredOverWindow([], full, '2026-08-25', TODAY);

    expect(report.considered).toBe(0);
    expect(report.unanchored).toBe(0);
    expect(driftLine(report)).toBeNull();
  });

  it('counts an item anchored only through its goal as anchored', () => {
    const throughGoal = [item({ id: 9, title: 'Write the changelog', momId: null, goalMomId: 30 })];

    expect(unanchoredCount(throughGoal, full)).toBe(0);
  });
});

describe('driftLine', () => {
  it('states the count as arithmetic, with no adjective and no verdict', () => {
    const report = unanchoredOverWindow(
      [
        item({ id: 1, date: '2026-08-28', momId: 30 }),
        item({ id: 2, date: '2026-08-29', momId: null }),
        item({ id: 3, date: '2026-08-30', momId: null }),
      ],
      full,
      '2026-08-25',
      TODAY,
    );

    const line = driftLine(report);
    expect(line).toBe("2 of your last 3 MITs weren't connected to anything above them.");
    // The words a shaming version would reach for are absent, and must stay absent.
    for (const word of ['drift', 'failed', 'should', 'only', 'wasted']) {
      expect(line?.toLowerCase()).not.toContain(word);
    }
  });

  it('says so plainly when nothing was unanchored', () => {
    const report = unanchoredOverWindow([item({ id: 1, momId: 30 })], full, '2026-08-25', TODAY);

    expect(driftLine(report)).toBe('All 1 of your last 1 MITs connected to something above them.');
  });

  it('takes the noun from the caller, so goals read as goals', () => {
    const report = unanchoredOverWindow([item({ id: 1, momId: null })], full, '2026-08-25', TODAY);

    expect(driftLine(report, 'goals')).toBe(
      "1 of your last 1 goals weren't connected to anything above them.",
    );
  });
});

describe('momCountdown', () => {
  const dated = full.moms[0] as MomNode;

  it('counts the days left in the window the user actually set', () => {
    const countdown = momCountdown(dated, TODAY);

    expect(countdown.daysRemaining).toBe(29);
    expect(countdown.elapsedDays).toBe(60);
    expect(countdown.totalDays).toBe(89);
  });

  it('shows no countdown at all when there is no end date (D40)', () => {
    // Not 0, and not "start + 90": defaulting the window would invent a deadline and then hold
    // someone to it.
    const undated: MomNode = { id: 40, title: 'Unbounded', missionId: null, startsOn: null, endsOn: null };
    const countdown = momCountdown(undated, TODAY);

    expect(countdown.daysRemaining).toBeNull();
    expect(countdown.elapsedDays).toBeNull();
    expect(countdown.totalDays).toBeNull();
  });

  it('goes negative once the window has passed rather than clamping to zero', () => {
    expect(momCountdown(dated, '2026-10-01').daysRemaining).toBe(-3);
  });
});

describe('isMomReviewDue', () => {
  const dated = full.moms[0] as MomNode;

  it('is due on the end date and after', () => {
    expect(isMomReviewDue(dated, '2026-09-28', false)).toBe(true);
    expect(isMomReviewDue(dated, '2026-10-05', false)).toBe(true);
  });

  it('is not due before the end date', () => {
    expect(isMomReviewDue(dated, '2026-09-27', false)).toBe(false);
  });

  it('is never due once it has been reviewed', () => {
    // The review is the closing ritual, not a nag that keeps firing after it is done.
    expect(isMomReviewDue(dated, '2026-10-05', true)).toBe(false);
  });

  it('is never due for a M.O.M. with no end date, and never due with no M.O.M. at all', () => {
    const undated: MomNode = { id: 40, title: 'Unbounded', missionId: null, startsOn: null, endsOn: null };
    expect(isMomReviewDue(undated, '2030-01-01', false)).toBe(false);
    expect(isMomReviewDue(null, TODAY, false)).toBe(false);
  });
});
