import { describe, expect, it } from 'vitest';
import { localDateFromInstant, localTimeToInstant } from './localToday';

describe('localDateFromInstant', () => {
  it('matches a simple same-day case', () => {
    expect(localDateFromInstant(new Date('2026-08-18T15:00:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-08-18',
    );
  });

  it('rolls back a day for a timezone behind UTC near midnight', () => {
    // 02:00 UTC is 21:00 the previous day in Indianapolis (UTC-5 in August is EDT/-4 actually,
    // but well before dawn UTC is still the previous evening locally either way).
    expect(localDateFromInstant(new Date('2026-08-18T02:00:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-08-17',
    );
  });

  it('rolls forward a day for a timezone ahead of UTC', () => {
    expect(localDateFromInstant(new Date('2026-01-01T20:00:00Z'), 'Pacific/Kiritimati')).toBe('2026-01-02');
  });

  it('agrees with the SQL local_date() function on the DST spring-forward boundary', () => {
    // Same cases proven in supabase/tests/database/01_local_date_helper.test.sql -- the
    // two implementations (Postgres and this one) must never disagree.
    expect(localDateFromInstant(new Date('2026-03-08T04:59:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-03-07',
    );
    expect(localDateFromInstant(new Date('2026-03-08T07:01:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-03-08',
    );
  });

  it('agrees with the SQL local_date() function on the DST fall-back boundary', () => {
    expect(localDateFromInstant(new Date('2026-11-01T05:59:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-11-01',
    );
    expect(localDateFromInstant(new Date('2026-11-01T06:01:00Z'), 'America/Indiana/Indianapolis')).toBe(
      '2026-11-01',
    );
  });

  it('agrees with the SQL local_date() function on the date-line cases', () => {
    expect(localDateFromInstant(new Date('2026-01-01T09:00:00Z'), 'Pacific/Kiritimati')).toBe('2026-01-01');
    expect(localDateFromInstant(new Date('2026-01-01T11:00:00Z'), 'Pacific/Kiritimati')).toBe('2026-01-02');
    expect(localDateFromInstant(new Date('2026-01-01T05:00:00Z'), 'Pacific/Niue')).toBe('2025-12-31');
  });

  it('throws on an unrecognized timezone rather than silently defaulting', () => {
    expect(() => localDateFromInstant(new Date(), 'Not/A_Real_Zone')).toThrow();
  });
});

describe('localTimeToInstant', () => {
  it('matches a simple same-day case', () => {
    expect(localTimeToInstant('2026-08-24', 16, 0, 'America/Indiana/Indianapolis')).toBe('2026-08-24T20:00:00.000Z');
  });

  it('produces the correct offset either side of the DST spring-forward boundary (2026-03-08)', () => {
    expect(localTimeToInstant('2026-03-07', 16, 0, 'America/Indiana/Indianapolis')).toBe('2026-03-07T21:00:00.000Z'); // EST, UTC-5
    expect(localTimeToInstant('2026-03-09', 16, 0, 'America/Indiana/Indianapolis')).toBe('2026-03-09T20:00:00.000Z'); // EDT, UTC-4
  });

  it('produces the correct offset either side of the DST fall-back boundary (2026-11-01)', () => {
    expect(localTimeToInstant('2026-10-31', 16, 0, 'America/Indiana/Indianapolis')).toBe('2026-10-31T20:00:00.000Z'); // still EDT
    expect(localTimeToInstant('2026-11-02', 16, 0, 'America/Indiana/Indianapolis')).toBe('2026-11-02T21:00:00.000Z'); // back to EST
  });

  it('handles a date-line zone correctly (Pacific/Kiritimati, UTC+14)', () => {
    expect(localTimeToInstant('2026-01-01', 8, 0, 'Pacific/Kiritimati')).toBe('2025-12-31T18:00:00.000Z');
  });

  it('handles a half-hour-offset zone correctly (Asia/Kolkata, UTC+5:30)', () => {
    expect(localTimeToInstant('2026-06-15', 9, 0, 'Asia/Kolkata')).toBe('2026-06-15T03:30:00.000Z');
  });

  it('throws on an unrecognized timezone rather than silently defaulting', () => {
    expect(() => localTimeToInstant('2026-08-24', 16, 0, 'Not/A_Real_Zone')).toThrow();
  });

  describe('round-trips with localDateFromInstant (two independent conversions must agree)', () => {
    const cases: Array<[string, string]> = [
      ['2026-08-24', 'America/Indiana/Indianapolis'], // ordinary summer day
      ['2026-03-07', 'America/Indiana/Indianapolis'], // day before spring-forward
      ['2026-03-08', 'America/Indiana/Indianapolis'], // the spring-forward day itself
      ['2026-03-09', 'America/Indiana/Indianapolis'], // day after spring-forward
      ['2026-10-31', 'America/Indiana/Indianapolis'], // day before fall-back
      ['2026-11-01', 'America/Indiana/Indianapolis'], // the fall-back day itself
      ['2026-11-02', 'America/Indiana/Indianapolis'], // day after fall-back
      ['2026-01-01', 'Pacific/Kiritimati'], // date-line, UTC+14
      ['2025-12-31', 'Pacific/Niue'], // date-line, UTC-11
      ['2026-06-15', 'Asia/Kolkata'], // half-hour offset
    ];

    it.each(cases)('for a daytime hour (14:00 local) on %s in %s, converting to an instant and back recovers the same local date', (date, timeZone) => {
      const instant = localTimeToInstant(date, 14, 0, timeZone);
      expect(localDateFromInstant(new Date(instant), timeZone)).toBe(date);
    });
  });
});
