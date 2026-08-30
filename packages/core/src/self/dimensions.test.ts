import { describe, expect, it } from 'vitest';
import {
  MIN_ACTS_TO_JUDGE,
  attentionThisWeek,
  dimensionStanding,
  resolveOvershoot,
  routeActs,
  type DimensionInput,
  type EvidenceAct,
  type RoutableAct,
  type RouteRule,
} from './dimensions';

const TODAY = '2026-06-30';

const focus: DimensionInput = { id: 1, name: 'Focus', parentId: null, ceiling: null };

function act(date: string, label = 'Hour', weight = 1): EvidenceAct {
  return { kind: 'session', date, label, weight };
}

function dailyActs(from: string, count: number): EvidenceAct[] {
  const out: EvidenceAct[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    out.push(act(new Date(start + i * 86_400_000).toISOString().slice(0, 10)));
  }
  return out;
}

describe('dimensionStanding', () => {
  it('shows no number at all until there is something to judge', () => {
    // A dimension scored 0 -- or 50 -- on the day it is created is reporting an initial condition
    // as a measurement. Null is the only honest answer.
    const fresh = dimensionStanding({ dimension: focus, acts: [], today: TODAY });
    expect(fresh.standing).toBeNull();
    expect(fresh.observedActs).toBe(0);

    const barely = dimensionStanding({
      dimension: focus,
      acts: [act('2026-06-28'), act('2026-06-29')],
      today: TODAY,
    });
    expect(barely.observedActs).toBeLessThan(MIN_ACTS_TO_JUDGE);
    expect(barely.standing).toBeNull();
  });

  it('reports a number once enough acts exist', () => {
    const standing = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-06-25', 5),
      today: TODAY,
    });
    expect(standing.standing).not.toBeNull();
    expect(standing.observedActs).toBe(5);
  });

  it('carries the acts alongside the number, so a bare score cannot be rendered', () => {
    // The integrity constraint, enforced by the return type rather than promised by a UI.
    const standing = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-06-25', 4),
      today: TODAY,
    });
    expect(standing.evidence).toHaveLength(4);
    expect(standing.evidence[0]!.date).toBe('2026-06-28');
    expect(standing.evidence.every((e) => e.label.length > 0)).toBe(true);
  });

  it('rises with consistency', () => {
    const sparse = dimensionStanding({
      dimension: focus,
      acts: [act('2026-06-01'), act('2026-06-10'), act('2026-06-20')],
      today: TODAY,
    });
    const steady = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-06-01', 30),
      today: TODAY,
    });
    expect(steady.standing!).toBeGreaterThan(sparse.standing!);
  });

  it('fades on neglect rather than resetting, and never reaches zero', () => {
    // D23's argument one layer down: a counter that returns to zero is the mechanic that makes
    // people quit. A neglected dimension drifts; it does not collapse.
    const neglected = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-04-01', 5),
      today: TODAY,
    });
    expect(neglected.standing!).toBeGreaterThan(0);
    expect(neglected.standing!).toBeLessThan(50);
  });

  it('recovers faster than it decayed, which is the asymmetry the design wants', () => {
    const neglected = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-04-01', 5),
      today: TODAY,
    });
    const returned = dimensionStanding({
      dimension: focus,
      acts: [...dailyActs('2026-04-01', 5), ...dailyActs('2026-06-24', 7)],
      today: TODAY,
    });
    expect(returned.standing!).toBeGreaterThan(neglected.standing! + 10);
  });

  it('counts several acts on one day, because one day really can serve a dimension twice', () => {
    const once = dimensionStanding({ dimension: focus, acts: dailyActs('2026-06-27', 3), today: TODAY });
    const twice = dimensionStanding({
      dimension: focus,
      acts: [...dailyActs('2026-06-27', 3), act('2026-06-27', 'Second Hour'), act('2026-06-28', 'Second Hour')],
      today: TODAY,
    });
    expect(twice.standing!).toBeGreaterThan(once.standing!);
  });

  it('honours weight without letting one act saturate the score', () => {
    const heavy = dimensionStanding({
      dimension: focus,
      acts: [act('2026-06-28', 'Hour', 100), act('2026-06-29'), act('2026-06-30')],
      today: TODAY,
    });
    expect(heavy.standing!).toBeLessThanOrEqual(100);
  });

  it('ignores acts outside the replay window and reports the last real one', () => {
    const standing = dimensionStanding({
      dimension: focus,
      acts: [act('2020-01-01'), ...dailyActs('2026-06-25', 4)],
      today: TODAY,
      windowDays: 90,
    });
    expect(standing.observedActs).toBe(4);
    expect(standing.lastActDate).toBe('2026-06-28');
  });

  it('never returns a total or any cross-dimension figure', () => {
    // D34 as a shape assertion: nothing on this object could be summed into a grand score.
    const standing = dimensionStanding({ dimension: focus, acts: dailyActs('2026-06-25', 4), today: TODAY });
    expect(Object.keys(standing)).not.toContain('total');
    expect(Object.keys(standing)).not.toContain('rank');
  });
});

describe('overshoot -- D35', () => {
  it('cannot fire without a ceiling the user set', () => {
    // Arrogance is not machine-detectable. No ceiling means the app stays quiet.
    expect(resolveOvershoot(null, 500)).toBe('within');
  });

  it('fires only above the user’s own ceiling', () => {
    expect(resolveOvershoot(6, 7)).toBe('over');
    expect(resolveOvershoot(6, 6)).toBe('within');
  });

  it('treats a quiet week as room, not as a failure state', () => {
    expect(resolveOvershoot(6, 2)).toBe('below');
    expect(resolveOvershoot(6, 4)).toBe('within');
  });

  it('surfaces on the standing itself', () => {
    const bounded: DimensionInput = { id: 2, name: 'Physique', parentId: null, ceiling: 4 };
    const standing = dimensionStanding({
      dimension: bounded,
      acts: dailyActs('2026-06-25', 6),
      today: TODAY,
    });
    expect(standing.actsThisWeek).toBe(6);
    expect(standing.overshoot).toBe('over');
  });
});

describe('attentionThisWeek', () => {
  it('reports acts rather than scores, ranked by attention', () => {
    // The only legitimate cross-dimension view. Ranking by standing would be the grand total D34
    // refuses, wearing a list's clothing.
    const focusStanding = dimensionStanding({
      dimension: focus,
      acts: dailyActs('2026-06-25', 6),
      today: TODAY,
    });
    const deenStanding = dimensionStanding({
      dimension: { id: 3, name: 'Deen', parentId: null, ceiling: null },
      acts: dailyActs('2026-06-29', 2),
      today: TODAY,
    });

    const attention = attentionThisWeek([deenStanding, focusStanding]);
    expect(attention[0]!.name).toBe('Focus');
    expect(attention[0]!.acts).toBe(6);
    expect(attention[1]!.acts).toBe(2);
    expect(Object.keys(attention[0]!)).toEqual(['dimensionId', 'name', 'acts']);
  });
});

describe('routeActs', () => {
  const businessHour: RoutableAct = {
    kind: 'session',
    date: '2026-06-28',
    label: 'Hour — ship the pricing page',
    matchValue: 'business',
  };
  const prayer: RoutableAct = {
    kind: 'prayer',
    date: '2026-06-28',
    label: 'Fajr on time',
    matchValue: 'fajr',
  };

  it('routes an act to the dimension its rule names', () => {
    const rules: RouteRule[] = [{ dimensionId: 10, kind: 'session', matchValue: 'business', weight: 1 }];
    const routed = routeActs([businessHour], rules);
    expect(routed.get(10)).toHaveLength(1);
    expect(routed.get(10)![0]!.label).toBe('Hour — ship the pricing page');
  });

  it('lets one act feed two dimensions when both rules match', () => {
    // A Business Hour really does serve both Work/Craft and Focus. Forcing a single owner would
    // make the user choose which truth to record.
    const rules: RouteRule[] = [
      { dimensionId: 10, kind: 'session', matchValue: 'business', weight: 1 },
      { dimensionId: 11, kind: 'session', matchValue: null, weight: 0.5 },
    ];
    const routed = routeActs([businessHour], rules);
    expect(routed.get(10)![0]!.weight).toBe(1);
    expect(routed.get(11)![0]!.weight).toBe(0.5);
  });

  it('prefers a specific rule over a catch-all within one dimension', () => {
    // So a general rule can be written once and refined later without deleting it.
    const rules: RouteRule[] = [
      { dimensionId: 10, kind: 'session', matchValue: null, weight: 0.25 },
      { dimensionId: 10, kind: 'session', matchValue: 'business', weight: 2 },
    ];
    const routed = routeActs([businessHour], rules);
    expect(routed.get(10)).toHaveLength(1);
    expect(routed.get(10)![0]!.weight).toBe(2);
  });

  it('leaves an unmatched act unrouted rather than inventing a destination', () => {
    // An unrouted act means a routing map that is not finished. Assigning it somewhere would put
    // acts behind a number nobody assigned them to.
    const rules: RouteRule[] = [{ dimensionId: 10, kind: 'prayer', matchValue: null, weight: 1 }];
    const routed = routeActs([businessHour, prayer], rules);
    expect(routed.get(10)).toHaveLength(1);
    expect(routed.get(10)![0]!.kind).toBe('prayer');
    expect([...routed.keys()]).toEqual([10]);
  });

  it('returns an empty map when nothing is routed yet, which is a real first-run state', () => {
    expect(routeActs([businessHour], []).size).toBe(0);
  });
});
