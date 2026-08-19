import { addDays, type LocalDate } from '../util/date';

/**
 * RFC 5545 (iCalendar) parser -- pure text-in, structured-data-out, no I/O, so it lives
 * in packages/core like everything else this product treats as domain logic (a
 * malformed calendar feed is exactly the kind of thing that should be caught by a
 * deterministic parser and unit-testable in isolation, not discovered live against a
 * real Brightspace account we don't have credentials for tonight).
 *
 * Scoped deliberately: FREQ=WEEKLY/DAILY recurrence (the realistic shape of a class
 * meeting schedule) is supported; MONTHLY/YEARLY are not -- a personal academic
 * calendar has no real use for them, and expanding them correctly (month-length
 * edge cases, BYMONTHDAY, etc.) is a different scope of problem. An unsupported FREQ
 * is not silently dropped: the single VEVENT is kept as its one DTSTART occurrence,
 * and a caller inspecting `malformedLineCount`/looking at `recurrenceIndex === null`
 * with an RRULE present would notice recurrence wasn't expanded.
 */

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  /** ISO instant for timed events; a bare YYYY-MM-DD for all-day events. */
  startAt: string;
  endAt: string | null;
  isAllDay: boolean;
  /** Set only for an occurrence expanded from an RRULE -- 0 for the first occurrence,
   *  1 for the second, etc. Null for a genuinely single, non-recurring event. Several
   *  expanded occurrences share the same `uid` (the RFC's own semantics: UID identifies
   *  the recurring series, not one instance), so a caller persisting these needs a
   *  composite key of (uid, recurrenceIndex), not uid alone. */
  recurrenceIndex: number | null;
}

export interface IcsParseResult {
  events: ParsedIcsEvent[];
  /** Lines inside a VEVENT that didn't parse as a recognized property -- an honest
   *  signal, never silently swallowed without a trace. A feed with a high count here
   *  is worth a human look, not a silent partial import. */
  malformedLineCount: number;
}

export interface ParseIcsOptions {
  /** A safety bound on recurrence expansion -- an RRULE with neither COUNT nor UNTIL
   *  is technically infinite (RFC 5545 permits it) and must not expand forever. */
  maxOccurrencesPerEvent?: number;
  /** Recurrence never expands past this LocalDate even if COUNT/UNTIL would allow more.
   *  Defaults to one year past the latest DTSTART seen in the feed. */
  expandRecurringUntil?: LocalDate;
}

const DEFAULT_MAX_OCCURRENCES = 200;

/** RFC 5545 line unfolding: a line that continues onto the next is "folded" -- the
 *  continuation begins with a single space or tab, which must be stripped and the
 *  content joined onto the previous line before any property parsing happens. */
function unfoldLines(icsText: string): string[] {
  const rawLines = icsText.split(/\r\n|\r|\n/);
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

interface PropertyLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Parses one unfolded line of the form `NAME;PARAM=VALUE;PARAM2=VALUE2:VALUE`. Returns
 *  null for a line that doesn't match this shape at all (truly malformed), which the
 *  caller counts rather than throws on -- one bad line must not sink the whole feed. */
function parsePropertyLine(line: string): PropertyLine | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;
  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [name, ...paramParts] = head.split(';');
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/** Converts wall-clock components in an arbitrary IANA zone to a UTC instant, using
 *  only Intl (no external tz database) -- the same "format, compare, correct" technique
 *  localToday.ts's localDateFromInstant relies on for the reverse direction. */
function zonedWallTimeToUtcInstant(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string): Date {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guessUtcMs)).map((p) => [p.type, p.value]));
  const displayedUtcMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const offsetMs = guessUtcMs - displayedUtcMs;
  return new Date(guessUtcMs + offsetMs);
}

/** Parses a DTSTART/DTEND property into either an all-day LocalDate or a timed instant. */
function parseDateTimeProperty(prop: PropertyLine): { isAllDay: true; localDate: LocalDate } | { isAllDay: false; instant: Date } | null {
  const isDateOnly = prop.params.VALUE === 'DATE' || /^\d{8}$/.test(prop.value);
  if (isDateOnly) {
    const match = prop.value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;
    return { isAllDay: true, localDate: `${match[1]}-${match[2]}-${match[3]}` };
  }

  const match = prop.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, zSuffix] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);

  if (zSuffix) {
    return { isAllDay: false, instant: new Date(Date.UTC(year, month - 1, day, hour, minute, second)) };
  }
  const tzid = prop.params.TZID;
  if (tzid) {
    try {
      return { isAllDay: false, instant: zonedWallTimeToUtcInstant(year, month, day, hour, minute, second, tzid) };
    } catch {
      // An unrecognized/invalid TZID (a real possibility from a feed generator with a
      // typo) -- fall through to floating-time-as-UTC rather than dropping the event.
    }
  }
  // "Floating" time (no TZID, no Z) -- RFC 5545 says this is meant to be interpreted in
  // whatever zone the consumer is in. Treated as UTC: an approximation, but a
  // documented one, and never silently dropped.
  return { isAllDay: false, instant: new Date(Date.UTC(year, month - 1, day, hour, minute, second)) };
}

interface RRule {
  freq: 'DAILY' | 'WEEKLY';
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: string[] | null; // e.g. ['MO', 'WE', 'FR']
}

function parseRRule(value: string): RRule | null {
  const parts = Object.fromEntries(
    value.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k?.toUpperCase() ?? '', v ?? ''];
    }),
  );
  if (parts.FREQ !== 'DAILY' && parts.FREQ !== 'WEEKLY') return null; // unsupported FREQ, scoped out deliberately
  const until = parts.UNTIL ? parseDateTimeProperty({ name: 'UNTIL', params: {}, value: parts.UNTIL }) : null;
  return {
    freq: parts.FREQ,
    interval: parts.INTERVAL ? Number(parts.INTERVAL) : 1,
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until: until && !until.isAllDay ? until.instant : until && until.isAllDay ? new Date(`${until.localDate}T23:59:59Z`) : null,
    byDay: parts.BYDAY ? parts.BYDAY.split(',') : null,
  };
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function expandRecurrence(start: Date, rrule: RRule, maxOccurrences: number, untilBound: Date): Date[] {
  const occurrences: Date[] = [];
  const stepDays = rrule.freq === 'DAILY' ? rrule.interval : rrule.interval * 7;
  const byDayCodes = rrule.byDay ?? [DAY_CODES[start.getUTCDay()]!];

  let cursor = new Date(start);
  let weekAnchor = new Date(start);
  // Walk week-by-week (or day-by-day for DAILY) so BYDAY can place multiple
  // occurrences inside the same WEEKLY step, in calendar order.
  while (occurrences.length < maxOccurrences) {
    if (rrule.freq === 'DAILY') {
      if (cursor > untilBound) break;
      if (cursor >= start) occurrences.push(new Date(cursor));
      cursor = new Date(cursor.getTime() + stepDays * 86_400_000);
      if (rrule.count != null && occurrences.length >= rrule.count) break;
      continue;
    }

    // WEEKLY: for the current week anchor, emit one occurrence per requested weekday.
    const weekStart = new Date(weekAnchor.getTime() - weekAnchor.getUTCDay() * 86_400_000);
    for (const code of byDayCodes) {
      const dayOffset = DAY_CODES.indexOf(code);
      if (dayOffset === -1) continue;
      const candidate = new Date(weekStart.getTime() + dayOffset * 86_400_000);
      candidate.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), 0);
      if (candidate < start || candidate > untilBound) continue;
      occurrences.push(candidate);
      if (rrule.count != null && occurrences.length >= rrule.count) break;
    }
    if (rrule.count != null && occurrences.length >= rrule.count) break;
    weekAnchor = new Date(weekAnchor.getTime() + stepDays * 86_400_000);
    if (weekAnchor > untilBound) break;
  }

  return occurrences
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(0, maxOccurrences);
}

export function parseIcsFeed(icsText: string, options: ParseIcsOptions = {}): IcsParseResult {
  const lines = unfoldLines(icsText);
  const events: ParsedIcsEvent[] = [];
  let malformedLineCount = 0;
  let latestDtStart: LocalDate | null = null;

  let inEvent = false;
  let current: {
    uid?: string;
    summary?: string;
    description?: string;
    location?: string;
    dtstart?: PropertyLine;
    dtend?: PropertyLine;
    rrule?: string;
  } = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.uid && current.dtstart) {
        const parsedStart = parseDateTimeProperty(current.dtstart);
        if (parsedStart) {
          if (parsedStart.isAllDay && (!latestDtStart || parsedStart.localDate > latestDtStart)) {
            latestDtStart = parsedStart.localDate;
          }
          const parsedEnd = current.dtend ? parseDateTimeProperty(current.dtend) : null;
          const base: Omit<ParsedIcsEvent, 'startAt' | 'endAt' | 'recurrenceIndex'> = {
            uid: current.uid,
            summary: current.summary ?? '(untitled)',
            description: current.description ?? null,
            location: current.location ?? null,
            isAllDay: parsedStart.isAllDay,
          };

          const rrule = current.rrule ? parseRRule(current.rrule) : null;
          if (rrule && !parsedStart.isAllDay) {
            const untilBound = rrule.until ?? new Date((options.expandRecurringUntil ?? addDays(latestDtStart ?? '2026-01-01', 365)) + 'T23:59:59Z');
            const occurrences = expandRecurrence(parsedStart.instant, rrule, options.maxOccurrencesPerEvent ?? DEFAULT_MAX_OCCURRENCES, untilBound);
            const durationMs = parsedEnd && !parsedEnd.isAllDay ? parsedEnd.instant.getTime() - parsedStart.instant.getTime() : null;
            occurrences.forEach((occurrenceStart, index) => {
              events.push({
                ...base,
                startAt: occurrenceStart.toISOString(),
                endAt: durationMs != null ? new Date(occurrenceStart.getTime() + durationMs).toISOString() : null,
                recurrenceIndex: index,
              });
            });
          } else {
            events.push({
              ...base,
              startAt: parsedStart.isAllDay ? parsedStart.localDate : parsedStart.instant.toISOString(),
              endAt: parsedEnd ? (parsedEnd.isAllDay ? parsedEnd.localDate : parsedEnd.instant.toISOString()) : null,
              recurrenceIndex: null,
            });
          }
        } else {
          malformedLineCount += 1; // DTSTART present but unparseable
        }
      }
      continue;
    }
    if (!inEvent) continue;

    const prop = parsePropertyLine(line);
    if (!prop) {
      if (line.trim().length > 0) malformedLineCount += 1;
      continue;
    }
    switch (prop.name) {
      case 'UID':
        current.uid = prop.value;
        break;
      case 'SUMMARY':
        current.summary = unescapeText(prop.value);
        break;
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value);
        break;
      case 'LOCATION':
        current.location = unescapeText(prop.value);
        break;
      case 'DTSTART':
        current.dtstart = prop;
        break;
      case 'DTEND':
        current.dtend = prop;
        break;
      case 'RRULE':
        current.rrule = prop.value;
        break;
      default:
        break; // a recognized-but-unhandled property (e.g. CATEGORIES) -- not malformed, just ignored
    }
  }

  return { events, malformedLineCount };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}
