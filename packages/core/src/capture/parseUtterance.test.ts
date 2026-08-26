import { describe, expect, it } from 'vitest';
import { parseUtterance } from './parseUtterance';

// 2026-08-26 is a Wednesday. Now = 14:30 local.
const CTX = { today: '2026-08-26', nowMinutesIntoDay: 14 * 60 + 30 };

describe('parseUtterance', () => {
  it('the V2 headline case: "remind me to submit my econ homework tomorrow at 6pm"', () => {
    const parsed = parseUtterance('remind me to submit my econ homework tomorrow at 6pm', CTX);
    expect(parsed.title).toBe('submit my econ homework');
    expect(parsed.date).toBe('2026-08-27');
    expect(parsed.time).toEqual({ hour: 18, minute: 0 });
    expect(parsed.matched).toEqual(['at 6pm', 'tomorrow']);
  });

  it('a bare weekday means the soonest FUTURE occurrence — today\'s own weekday is a week out', () => {
    expect(parseUtterance('email advisor on friday', CTX).date).toBe('2026-08-28');
    expect(parseUtterance('review notes wednesday', CTX).date).toBe('2026-09-02');
    expect(parseUtterance('call home next monday', CTX).date).toBe('2026-08-31');
  });

  it('"in two hours" computes from the local clock and can roll past midnight', () => {
    const sameDay = parseUtterance('take out laundry in two hours', CTX);
    expect(sameDay.date).toBe('2026-08-26');
    expect(sameDay.time).toEqual({ hour: 16, minute: 30 });

    const lateNight = parseUtterance('stretch in 3 hours', { today: '2026-08-26', nowMinutesIntoDay: 23 * 60 });
    expect(lateNight.date).toBe('2026-08-27');
    expect(lateNight.time).toEqual({ hour: 2, minute: 0 });
  });

  it('a clock time with no date means the NEXT occurrence of that time', () => {
    expect(parseUtterance('gym at 6pm', CTX).date).toBe('2026-08-26'); // 18:00 > 14:30
    expect(parseUtterance('gym at 9am', CTX).date).toBe('2026-08-27'); // 09:00 already passed
  });

  it('month-day and slash dates roll to next year when already past', () => {
    expect(parseUtterance('renew passport on Sep 12', CTX).date).toBe('2026-09-12');
    expect(parseUtterance('wish sara happy birthday on 3/14', CTX).date).toBe('2027-03-14');
  });

  it('"tonight" fixes the date but NEVER invents an evening hour', () => {
    const parsed = parseUtterance('outline the essay tonight', CTX);
    expect(parsed.date).toBe('2026-08-26');
    expect(parsed.time).toBeNull();
  });

  it('an ambiguous "at 6" stays unparsed — null beats a guess', () => {
    const parsed = parseUtterance('meet ta at 6', CTX);
    expect(parsed.time).toBeNull();
    expect(parsed.date).toBeNull();
    expect(parsed.title).toBe('meet ta at 6');
  });

  it('24-hour and noon/midnight forms parse', () => {
    expect(parseUtterance('lab report at 18:45 tomorrow', CTX).time).toEqual({ hour: 18, minute: 45 });
    expect(parseUtterance('quiz review at noon tomorrow', CTX).time).toEqual({ hour: 12, minute: 0 });
  });

  it('no temporal content at all: everything null, title intact', () => {
    const parsed = parseUtterance('buy a new charger', CTX);
    expect(parsed).toEqual({ title: 'buy a new charger', date: null, time: null, matched: [] });
  });
});
