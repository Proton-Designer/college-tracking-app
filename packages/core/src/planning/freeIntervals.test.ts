import { describe, expect, it } from 'vitest';
import { findFreeIntervals, intervalMinutes } from './freeIntervals';

const DAY_START = '2026-08-24T08:00:00.000Z'; // Monday
const DAY_END = '2026-08-24T23:00:00.000Z';

describe('findFreeIntervals', () => {
  it('a day with no busy events is one single free interval spanning the whole window', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, []);
    expect(free).toEqual([{ start: DAY_START, end: DAY_END }]);
  });

  it('a single busy event in the middle produces two free intervals, before and after', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-24T14:00:00.000Z', endAt: '2026-08-24T15:20:00.000Z' }]);
    expect(free).toEqual([
      { start: DAY_START, end: '2026-08-24T14:00:00.000Z' },
      { start: '2026-08-24T15:20:00.000Z', end: DAY_END },
    ]);
  });

  it('a busy event that fully spans the window leaves zero free intervals, not a negative one', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-24T00:00:00.000Z', endAt: '2026-08-25T00:00:00.000Z' }]);
    expect(free).toEqual([]);
  });

  it('a busy event entirely outside the window is ignored, not clipped into a zero-length artifact', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-23T10:00:00.000Z', endAt: '2026-08-23T11:00:00.000Z' }]);
    expect(free).toEqual([{ start: DAY_START, end: DAY_END }]);
  });

  it('a busy event straddling the window boundary is clipped to the window, not extended past it', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-24T07:00:00.000Z', endAt: '2026-08-24T09:00:00.000Z' }]);
    expect(free).toEqual([{ start: '2026-08-24T09:00:00.000Z', end: DAY_END }]);
  });

  it('overlapping busy events are merged into one block, not two adjacent gaps with a phantom sliver between them', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [
      { startAt: '2026-08-24T10:00:00.000Z', endAt: '2026-08-24T12:00:00.000Z' },
      { startAt: '2026-08-24T11:00:00.000Z', endAt: '2026-08-24T13:00:00.000Z' }, // overlaps the first
    ]);
    expect(free).toEqual([
      { start: DAY_START, end: '2026-08-24T10:00:00.000Z' },
      { start: '2026-08-24T13:00:00.000Z', end: DAY_END },
    ]);
  });

  it('back-to-back (touching, non-overlapping) busy events are merged -- no zero-length free interval between them', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [
      { startAt: '2026-08-24T10:00:00.000Z', endAt: '2026-08-24T11:00:00.000Z' },
      { startAt: '2026-08-24T11:00:00.000Z', endAt: '2026-08-24T12:00:00.000Z' }, // starts exactly where the first ends
    ]);
    expect(free).toEqual([
      { start: DAY_START, end: '2026-08-24T10:00:00.000Z' },
      { start: '2026-08-24T12:00:00.000Z', end: DAY_END },
    ]);
  });

  it('busy events out of chronological order in the input are still handled correctly', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [
      { startAt: '2026-08-24T18:00:00.000Z', endAt: '2026-08-24T19:00:00.000Z' },
      { startAt: '2026-08-24T10:00:00.000Z', endAt: '2026-08-24T11:00:00.000Z' },
    ]);
    expect(free).toEqual([
      { start: DAY_START, end: '2026-08-24T10:00:00.000Z' },
      { start: '2026-08-24T11:00:00.000Z', end: '2026-08-24T18:00:00.000Z' },
      { start: '2026-08-24T19:00:00.000Z', end: DAY_END },
    ]);
  });

  it('a malformed window (end before start) returns no free intervals rather than a negative-duration one', () => {
    expect(findFreeIntervals(DAY_END, DAY_START, [])).toEqual([]);
  });

  it('a zero/negative-duration busy event (bad data) is excluded rather than producing a degenerate split', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-24T14:00:00.000Z', endAt: '2026-08-24T14:00:00.000Z' }]);
    expect(free).toEqual([{ start: DAY_START, end: DAY_END }]);
  });

  it('an event spanning midnight (started the previous calendar day, ends inside this window) is clipped correctly, not treated as a separate case', () => {
    // No day-boundary special-casing exists in this function -- pure instant comparison
    // -- but proving it explicitly since interval merging is deceptively easy to get
    // subtly wrong at exactly this kind of edge.
    const free = findFreeIntervals(DAY_START, DAY_END, [{ startAt: '2026-08-23T23:00:00.000Z', endAt: '2026-08-24T09:30:00.000Z' }]);
    expect(free).toEqual([{ start: '2026-08-24T09:30:00.000Z', end: DAY_END }]);
  });

  it('a day fully packed with back-to-back events leaves genuinely zero free time', () => {
    const free = findFreeIntervals(DAY_START, DAY_END, [
      { startAt: '2026-08-24T08:00:00.000Z', endAt: '2026-08-24T15:00:00.000Z' },
      { startAt: '2026-08-24T15:00:00.000Z', endAt: '2026-08-24T23:00:00.000Z' },
    ]);
    expect(free).toEqual([]);
  });
});

describe('intervalMinutes', () => {
  it('computes the duration of a real interval', () => {
    expect(intervalMinutes({ start: '2026-08-24T14:00:00.000Z', end: '2026-08-24T15:30:00.000Z' })).toBe(90);
  });

  it('is zero for a zero-length interval', () => {
    expect(intervalMinutes({ start: DAY_START, end: DAY_START })).toBe(0);
  });
});
