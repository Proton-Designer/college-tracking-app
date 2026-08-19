import { describe, expect, it } from 'vitest';
import { localDateFromInstant } from './localToday';

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
