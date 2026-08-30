import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGNAL_DOMAINS,
  DOMAIN_LABELS,
  LIFE_DOMAINS,
  SESSION_TYPES,
  SESSION_TYPE_LABELS,
  countsTowardHours,
  isLifeDomain,
  isSessionType,
  isSignalDomain,
  resolveSignalDomains,
} from './domains';

describe('the shared vocabulary', () => {
  it('labels every member of both unions', () => {
    // A missing label surfaces as `undefined` in a chip rather than as a type error,
    // because Record<LifeDomain, string> is only checked where the object is written.
    for (const d of LIFE_DOMAINS) expect(DOMAIN_LABELS[d]).toBeTruthy();
    for (const t of SESSION_TYPES) expect(SESSION_TYPE_LABELS[t]).toBeTruthy();
  });

  it('guards reject values from the other union and from nothing', () => {
    expect(isLifeDomain('deen')).toBe(true);
    expect(isLifeDomain('deep_work')).toBe(false);
    expect(isLifeDomain(null)).toBe(false);
    expect(isSessionType('learn')).toBe(true);
    expect(isSessionType('school')).toBe(false);
    expect(isSessionType(undefined)).toBe(false);
  });
});

describe('countsTowardHours -- D28', () => {
  it('counts the three deep types', () => {
    expect(countsTowardHours('deep_work')).toBe(true);
    expect(countsTowardHours('deep_study')).toBe(true);
    expect(countsTowardHours('exam_prep')).toBe(true);
  });

  it('excludes Learn, so a five-minute retention session cannot win a day', () => {
    // The whole of D28: a Learn session is real, lands in the same table, shows on the
    // Wall and counts toward Signal coverage -- and must not inflate a baseline the user
    // calibrated against deep work.
    expect(countsTowardHours('learn')).toBe(false);
  });

  it('excludes Anti-Worry, which is maintenance rather than output', () => {
    expect(countsTowardHours('anti_worry')).toBe(false);
  });

  it('partitions the union with no unclassified members', () => {
    const counted = SESSION_TYPES.filter(countsTowardHours);
    const uncounted = SESSION_TYPES.filter((t) => !countsTowardHours(t));
    expect(counted.length + uncounted.length).toBe(SESSION_TYPES.length);
    expect(counted).toEqual(['deep_work', 'deep_study', 'exam_prep']);
  });
});

describe('resolveSignalDomains -- D38', () => {
  it('defaults to coverage semantics when nothing is stored', () => {
    expect(resolveSignalDomains(null)).toEqual(DEFAULT_SIGNAL_DOMAINS);
    expect(resolveSignalDomains(undefined)).toEqual(DEFAULT_SIGNAL_DOMAINS);
  });

  it('honours a narrowed priority lens', () => {
    // Ayman's original ruling, expressed as data rather than compiled in.
    const lens = resolveSignalDomains(['deen', 'business']);
    expect(lens).toEqual(['deen', 'business']);
    expect(isSignalDomain('school', lens)).toBe(false);
    expect(isSignalDomain('deen', lens)).toBe(true);
  });

  it('falls back rather than rendering a life as pure noise', () => {
    // An empty or corrupt array would otherwise make every domain noise, which reads as a
    // confident verdict about someone who has simply never opened Settings.
    expect(resolveSignalDomains([])).toEqual(DEFAULT_SIGNAL_DOMAINS);
    expect(resolveSignalDomains(['nonsense', 42])).toEqual(DEFAULT_SIGNAL_DOMAINS);
  });

  it('keeps only the valid members when a set is partly corrupt', () => {
    expect(resolveSignalDomains(['deen', 'nope'])).toEqual(['deen']);
  });
});
