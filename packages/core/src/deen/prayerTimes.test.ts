import { describe, expect, it } from 'vitest';
import {
  METHOD_ANGLES,
  PRAYER_NAMES,
  calculatePrayerTimes,
  computePrayerWindows,
  isSunAngleReachable,
  nextPrayer,
  sunDeclinationDeg,
  zoneOffsetMinutes,
} from './prayerTimes';

/**
 * These tests assert *relationships* rather than a table of published minute values.
 *
 * That is deliberate. A hardcoded expected time would only prove this file still returns whatever
 * it returned when the test was written, and published tables differ between sources by a minute
 * or two anyway. The relationships below (ordering, how each convention's angle moves its prayer,
 * what the Hanafi shadow factor does to Asr, what latitude does to the spread) are what actually
 * constrain the astronomy: an implementation that gets any of them backwards is wrong in a way a
 * user would notice, and no wrong implementation satisfies all of them at once.
 */

// Arlington, Texas — where the three users actually are. Central time, so it also exercises a
// UTC-negative offset and a real DST transition.
const ARLINGTON = { lat: 32.7357, lng: -97.1081, timeZone: 'America/Chicago' } as const;

function minutesInto(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

describe('zoneOffsetMinutes', () => {
  it('resolves standard and daylight offsets from the zone, not a table', () => {
    expect(zoneOffsetMinutes('2026-01-15', 'America/Chicago')).toBe(-360);
    expect(zoneOffsetMinutes('2026-07-15', 'America/Chicago')).toBe(-300);
  });

  it('handles a zone with a positive offset and one with none', () => {
    expect(zoneOffsetMinutes('2026-01-15', 'Asia/Riyadh')).toBe(180);
    expect(zoneOffsetMinutes('2026-01-15', 'UTC')).toBe(0);
  });

  it('is correct on the day of a DST transition', () => {
    // US DST begins 2026-03-08. Sampling at noon keeps the reported offset the one the day
    // actually ran on rather than the one it started at.
    expect(zoneOffsetMinutes('2026-03-08', 'America/Chicago')).toBe(-300);
    expect(zoneOffsetMinutes('2026-03-07', 'America/Chicago')).toBe(-360);
  });
});

describe('calculatePrayerTimes', () => {
  const times = calculatePrayerTimes({
    date: '2026-06-15',
    ...ARLINGTON,
    calcMethod: 'isna',
    asrMadhab: 'standard',
  });

  it('produces the six events in the order the day runs', () => {
    const order = [times.fajr, times.sunrise, times.dhuhr, times.asr, times.maghrib, times.isha];
    const parsed = order.map((iso) => Date.parse(iso));
    expect(parsed.every((ms) => !Number.isNaN(ms))).toBe(true);
    for (let i = 1; i < parsed.length; i += 1) {
      expect(parsed[i]).toBeGreaterThan(parsed[i - 1]!);
    }
  });

  it('lands every event on the intended local day, not a UTC one', () => {
    // The bug this guards is B4's shape: an instant from ~19:00 local onward in a UTC-negative
    // zone has already rolled to the next UTC calendar day, so a UTC-derived day boundary would
    // silently compute tomorrow's times all evening.
    for (const iso of Object.values(times)) {
      const localDay = new Intl.DateTimeFormat('en-CA', {
        timeZone: ARLINGTON.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(iso));
      expect(localDay).toBe('2026-06-15');
    }
  });

  it('puts midsummer Dhuhr near local solar noon', () => {
    const dhuhrMinutes = minutesInto(times.dhuhr, ARLINGTON.timeZone);
    expect(dhuhrMinutes).toBeGreaterThan(12 * 60);
    expect(dhuhrMinutes).toBeLessThan(14 * 60);
  });

  it('gives a shorter day in winter than in summer', () => {
    const winter = calculatePrayerTimes({
      date: '2026-12-15',
      ...ARLINGTON,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    });
    const summerDaylight = Date.parse(times.maghrib) - Date.parse(times.sunrise);
    const winterDaylight = Date.parse(winter.maghrib) - Date.parse(winter.sunrise);
    expect(winterDaylight).toBeLessThan(summerDaylight);
  });
});

describe('calculation conventions actually change the answer', () => {
  const base = { date: '2026-06-15', ...ARLINGTON, asrMadhab: 'standard' } as const;

  it('a shallower Fajr angle puts Fajr later', () => {
    // ISNA's 15 degrees is shallower than MWL's 18, so the sun reaches it closer to sunrise.
    expect(METHOD_ANGLES.isna.fajr).toBeLessThan(METHOD_ANGLES.mwl.fajr);
    const isna = calculatePrayerTimes({ ...base, calcMethod: 'isna' });
    const mwl = calculatePrayerTimes({ ...base, calcMethod: 'mwl' });
    expect(Date.parse(isna.fajr)).toBeGreaterThan(Date.parse(mwl.fajr));
  });

  it('a shallower Isha angle puts Isha earlier', () => {
    const isna = calculatePrayerTimes({ ...base, calcMethod: 'isna' });
    const egyptian = calculatePrayerTimes({ ...base, calcMethod: 'egyptian' });
    expect(Date.parse(isna.isha)).toBeLessThan(Date.parse(egyptian.isha));
  });

  it('leaves Dhuhr and Maghrib untouched — they do not depend on the convention', () => {
    const isna = calculatePrayerTimes({ ...base, calcMethod: 'isna' });
    const karachi = calculatePrayerTimes({ ...base, calcMethod: 'karachi' });
    expect(isna.dhuhr).toBe(karachi.dhuhr);
    expect(isna.maghrib).toBe(karachi.maghrib);
  });

  it('Hanafi Asr falls later than standard, and only Asr moves', () => {
    const standard = calculatePrayerTimes({ ...base, calcMethod: 'isna' });
    const hanafi = calculatePrayerTimes({ ...base, calcMethod: 'isna', asrMadhab: 'hanafi' });
    expect(Date.parse(hanafi.asr)).toBeGreaterThan(Date.parse(standard.asr));
    expect(hanafi.dhuhr).toBe(standard.dhuhr);
    expect(hanafi.maghrib).toBe(standard.maghrib);
  });
});

describe('high latitude', () => {
  // Tromsø in midsummer: the sun never descends 15 degrees below the horizon, so Fajr and Isha
  // have no true time. The hour-angle clamp would otherwise return a confident wrong answer.
  const TROMSO = { lat: 69.6496, lng: 18.956, timeZone: 'Europe/Oslo' } as const;

  it('reports the defining angle as unreachable', () => {
    const declination = sunDeclinationDeg(new Date('2026-06-21T00:00:00Z'), TROMSO.lng);
    expect(isSunAngleReachable(METHOD_ANGLES.isna.fajr, TROMSO.lat, declination)).toBe(false);
  });

  it('returns null windows rather than a fabricated time', () => {
    const windows = computePrayerWindows({
      date: '2026-06-21',
      ...TROMSO,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    });
    expect(windows.fajr).toBeNull();
    expect(windows.isha).toBeNull();
    // The prayers whose windows are defined by the sun's actual position still resolve.
    expect(windows.dhuhr).not.toBeNull();
    expect(windows.asr).not.toBeNull();
    expect(windows.maghrib).not.toBeNull();
  });

  it('still resolves every window there in winter', () => {
    const windows = computePrayerWindows({
      date: '2026-11-05',
      ...TROMSO,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    });
    for (const name of PRAYER_NAMES) expect(windows[name]).not.toBeNull();
  });
});

describe('computePrayerWindows', () => {
  const windows = computePrayerWindows({
    date: '2026-06-15',
    ...ARLINGTON,
    calcMethod: 'isna',
    asrMadhab: 'standard',
  });

  it('chains each window into the next with no gaps between Dhuhr and Isha', () => {
    expect(windows.dhuhr!.end).toBe(windows.asr!.start);
    expect(windows.asr!.end).toBe(windows.maghrib!.start);
    expect(windows.maghrib!.end).toBe(windows.isha!.start);
  });

  it('ends Isha at the next day’s Fajr, not at midnight', () => {
    const nextFajr = calculatePrayerTimes({
      date: '2026-06-16',
      ...ARLINGTON,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    }).fajr;
    expect(windows.isha!.end).toBe(nextFajr);
    expect(Date.parse(windows.isha!.end)).toBeGreaterThan(Date.parse(windows.isha!.start));
  });

  it('crosses a DST boundary without shifting Isha’s end by an hour', () => {
    // 2026-03-07 is the day before US DST begins, so Isha's window is the one that spans the
    // transition. Its end must equal the 8th's real Fajr, computed on the 8th's own offset.
    const eve = computePrayerWindows({
      date: '2026-03-07',
      ...ARLINGTON,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    });
    const morningAfter = calculatePrayerTimes({
      date: '2026-03-08',
      ...ARLINGTON,
      calcMethod: 'isna',
      asrMadhab: 'standard',
    });
    expect(eve.isha!.end).toBe(morningAfter.fajr);
  });
});

describe('nextPrayer', () => {
  const windows = computePrayerWindows({
    date: '2026-06-15',
    ...ARLINGTON,
    calcMethod: 'isna',
    asrMadhab: 'standard',
  });

  it('reports the open window as current', () => {
    const midDhuhr = new Date((Date.parse(windows.dhuhr!.start) + Date.parse(windows.dhuhr!.end)) / 2);
    const result = nextPrayer(windows, midDhuhr);
    expect(result?.name).toBe('dhuhr');
    expect(result?.isCurrent).toBe(true);
  });

  it('reports the earliest not-yet-open window before the day starts', () => {
    const beforeFajr = new Date(Date.parse(windows.fajr!.start) - 60_000);
    const result = nextPrayer(windows, beforeFajr);
    expect(result?.name).toBe('fajr');
    expect(result?.isCurrent).toBe(false);
  });

  it('returns null once the last window has closed', () => {
    const afterIsha = new Date(Date.parse(windows.isha!.end) + 60_000);
    expect(nextPrayer(windows, afterIsha)).toBeNull();
  });

  it('skips null windows instead of treating them as due', () => {
    const partial = { ...windows, fajr: null };
    const beforeDawn = new Date(Date.parse(windows.fajr!.start) - 60_000);
    expect(nextPrayer(partial, beforeDawn)?.name).toBe('dhuhr');
  });

  it('returns null when nothing is computable at all', () => {
    const none = { fajr: null, dhuhr: null, asr: null, maghrib: null, isha: null };
    expect(nextPrayer(none, new Date('2026-06-15T12:00:00Z'))).toBeNull();
  });
});
