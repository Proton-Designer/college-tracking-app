import { describe, expect, it } from 'vitest';
import { parseIcsFeed } from './icsParser';

function ics(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Brightspace//Calendar//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;
}

describe('parseIcsFeed', () => {
  it('parses a basic UTC timed event', () => {
    const result = parseIcsFeed(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:exam1@brightspace',
          'SUMMARY:BME 301 Exam 2',
          'LOCATION:ARMS 1010',
          'DTSTART:20260901T140000Z',
          'DTEND:20260901T160000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(result.malformedLineCount).toBe(0);
    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.uid).toBe('exam1@brightspace');
    expect(event.summary).toBe('BME 301 Exam 2');
    expect(event.location).toBe('ARMS 1010');
    expect(event.isAllDay).toBe(false);
    expect(event.startAt).toBe('2026-09-01T14:00:00.000Z');
    expect(event.endAt).toBe('2026-09-01T16:00:00.000Z');
    expect(event.recurrenceIndex).toBeNull();
  });

  it('parses an all-day event as a bare local date, not a fabricated time', () => {
    const result = parseIcsFeed(
      ics(['BEGIN:VEVENT', 'UID:holiday1@brightspace', 'SUMMARY:Fall Break -- No Classes', 'DTSTART;VALUE=DATE:20261126', 'DTEND;VALUE=DATE:20261128', 'END:VEVENT'].join('\r\n')),
    );
    const event = result.events[0]!;
    expect(event.isAllDay).toBe(true);
    expect(event.startAt).toBe('2026-11-26');
    expect(event.endAt).toBe('2026-11-28');
  });

  it('resolves a TZID-bearing timed event to the correct UTC instant, not a naive floating time', () => {
    // 9:00 AM Eastern in late August (EDT, UTC-4) is 13:00 UTC.
    const result = parseIcsFeed(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:lecture1@brightspace',
          'SUMMARY:BME 301 Lecture',
          'DTSTART;TZID=America/New_York:20260824T090000',
          'DTEND;TZID=America/New_York:20260824T095000',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    const event = result.events[0]!;
    expect(event.startAt).toBe('2026-08-24T13:00:00.000Z');
    expect(event.endAt).toBe('2026-08-24T13:50:00.000Z');
  });

  it('correctly crosses a DST boundary for a TZID event (winter, EST = UTC-5)', () => {
    const result = parseIcsFeed(
      ics(['BEGIN:VEVENT', 'UID:lecture-winter@brightspace', 'SUMMARY:Winter Lecture', 'DTSTART;TZID=America/New_York:20261201T090000', 'END:VEVENT'].join('\r\n')),
    );
    expect(result.events[0]!.startAt).toBe('2026-12-01T14:00:00.000Z');
  });

  it('unfolds a continuation line before parsing -- RFC 5545 line folding', () => {
    const result = parseIcsFeed(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:folded1@brightspace',
          'SUMMARY:BME 301 Guest Lecture -- Genuinely Long Title That Would Wrap',
          '  Onto A Second Physical Line In A Real Feed',
          'DTSTART:20260910T140000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(result.events[0]!.summary).toBe('BME 301 Guest Lecture -- Genuinely Long Title That Would Wrap Onto A Second Physical Line In A Real Feed');
  });

  it('expands a WEEKLY recurring lecture with BYDAY and COUNT into individual occurrences', () => {
    // Aug 24 2026 is a Monday. MO,WE,FR for 6 occurrences -> Mon/Wed/Fri, Mon/Wed/Fri.
    const result = parseIcsFeed(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:series1@brightspace',
          'SUMMARY:BME 301 Lecture',
          'DTSTART:20260824T140000Z',
          'DTEND:20260824T145000Z',
          'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(result.events).toHaveLength(6);
    expect(result.events.every((e) => e.uid === 'series1@brightspace')).toBe(true);
    expect(result.events.map((e) => e.recurrenceIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.events.map((e) => e.startAt.slice(0, 10))).toEqual(['2026-08-24', '2026-08-26', '2026-08-28', '2026-08-31', '2026-09-02', '2026-09-04']);
    // Duration preserved across every expanded occurrence.
    for (const e of result.events) {
      expect(new Date(e.endAt!).getTime() - new Date(e.startAt).getTime()).toBe(50 * 60_000);
    }
  });

  it('expands a WEEKLY recurring event bounded by UNTIL rather than COUNT', () => {
    const result = parseIcsFeed(
      ics(['BEGIN:VEVENT', 'UID:series2@brightspace', 'SUMMARY:Office Hours', 'DTSTART:20260824T180000Z', 'RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260915T235959Z', 'END:VEVENT'].join('\r\n')),
    );
    // Tuesdays from Aug 25 through Sep 15 inclusive: 25, Sep 1, Sep 8, Sep 15 -- 4 occurrences.
    expect(result.events).toHaveLength(4);
    expect(result.events[result.events.length - 1]!.startAt.slice(0, 10)).toBe('2026-09-15');
  });

  it('caps recurrence expansion at maxOccurrencesPerEvent -- an unbounded RRULE never expands forever', () => {
    const result = parseIcsFeed(ics(['BEGIN:VEVENT', 'UID:unbounded@brightspace', 'SUMMARY:Daily standup', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY', 'END:VEVENT'].join('\r\n')), {
      maxOccurrencesPerEvent: 10,
    });
    expect(result.events).toHaveLength(10);
  });

  it('counts a malformed line without dropping the rest of the feed', () => {
    const result = parseIcsFeed(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:ok1@brightspace',
          'SUMMARY:Real Event',
          'THIS IS NOT A VALID PROPERTY LINE AT ALL',
          'DTSTART:20260901T140000Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:ok2@brightspace',
          'SUMMARY:Second Real Event',
          'DTSTART:20260902T140000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(result.malformedLineCount).toBe(1);
    expect(result.events).toHaveLength(2); // both real events still parsed despite the garbage line
    expect(result.events.map((e) => e.uid)).toEqual(['ok1@brightspace', 'ok2@brightspace']);
  });

  it('unescapes backslash-escaped text per RFC 5545 (commas, semicolons, newlines)', () => {
    const result = parseIcsFeed(
      ics(['BEGIN:VEVENT', 'UID:escaped1@brightspace', 'SUMMARY:Midterm\\, Ch. 1-5\\; bring calculator', 'DTSTART:20260901T140000Z', 'END:VEVENT'].join('\r\n')),
    );
    expect(result.events[0]!.summary).toBe('Midterm, Ch. 1-5; bring calculator');
  });

  it('an event with no VEVENT block at all is not an error -- an honest empty result', () => {
    const result = parseIcsFeed(ics(''));
    expect(result.events).toHaveLength(0);
    expect(result.malformedLineCount).toBe(0);
  });
});
