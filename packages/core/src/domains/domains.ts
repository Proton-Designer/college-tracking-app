/**
 * The five life domains and the five session types -- the merge's shared vocabulary.
 *
 * These unions mirror the `life_domain` and `session_type` Postgres enums exactly
 * (migration 48). They are the reason every surface in Ihsan can read one session table
 * and still mean different things by it: `domain` says which part of a life a session
 * served, `sessionType` says what kind of work it was, and the two are independent.
 */

/** Directive rule 3.4: domains are lenses over shared primitives, not silos. */
export type LifeDomain = 'deen' | 'business' | 'school' | 'fitness' | 'work';

export type SessionType = 'deep_work' | 'deep_study' | 'learn' | 'anti_worry' | 'exam_prep';

/**
 * Presentation order, fixed here rather than per-surface so the sidebar, the sector chips,
 * the Signal ring segments and the domain picker can never disagree about it.
 */
export const LIFE_DOMAINS: readonly LifeDomain[] = [
  'deen',
  'business',
  'school',
  'fitness',
  'work',
] as const;

export const SESSION_TYPES: readonly SessionType[] = [
  'deep_work',
  'deep_study',
  'learn',
  'anti_worry',
  'exam_prep',
] as const;

export const DOMAIN_LABELS: Readonly<Record<LifeDomain, string>> = {
  deen: 'Deen',
  business: 'Business',
  school: 'School',
  fitness: 'Fitness',
  work: 'Work',
};

export const SESSION_TYPE_LABELS: Readonly<Record<SessionType, string>> = {
  deep_work: 'Deep Work',
  deep_study: 'Deep Study',
  learn: 'Learn',
  anti_worry: 'Anti-Worry',
  exam_prep: 'Exam Prep',
};

export function isLifeDomain(value: unknown): value is LifeDomain {
  return typeof value === 'string' && (LIFE_DOMAINS as readonly string[]).includes(value);
}

export function isSessionType(value: unknown): value is SessionType {
  return typeof value === 'string' && (SESSION_TYPES as readonly string[]).includes(value);
}

/**
 * D28 -- the depth axis. Storage identity is not metrics identity.
 *
 * One session table (D27) does not mean one metric. The Hours count is what Day Won, the
 * per-weekday baselines, Delta and Efficiency are all defined against, and those numbers
 * were calibrated by the user against *deep work*. A five-minute Learn session is a real
 * session, belongs on the Wall, and counts toward Signal coverage -- but counting it
 * toward Day Won would silently redefine every baseline the user already set, which is a
 * change to what D23's "per-weekday baseline hit" means that nobody decided.
 *
 * `anti_worry` is excluded for the same reason from the other side: the Monday
 * Anti-Worry Hour is maintenance that clears the deck, not output the baseline was set
 * against.
 *
 * This predicate is the ONLY place that judgement lives. Migration 48's
 * `task_sessions_hour_index_is_deep` constraint is its write-side twin, so a row that
 * would make the two disagree cannot be stored.
 */
export function countsTowardHours(sessionType: SessionType): boolean {
  return sessionType === 'deep_work' || sessionType === 'deep_study' || sessionType === 'exam_prep';
}

/**
 * D38 -- what counts as Signal is a per-user setting, never a constant.
 *
 * LifeOS compiles `Signal = Deen + Business` into its ratio. That is one person's ranking
 * of their own life, and Ihsan has three users who do not share one. The default below is
 * coverage semantics -- every domain is signal, and only unaccounted time is noise --
 * which is what the directive means by Signal:Noise measuring where all the time went.
 * Narrowing the set is the "priority domains" lens and reproduces the original behaviour
 * exactly.
 */
export const DEFAULT_SIGNAL_DOMAINS: readonly LifeDomain[] = LIFE_DOMAINS;

/**
 * Reads a stored signal set defensively. An empty or malformed array falls back to the
 * default rather than to "nothing is signal", which would render every day as pure noise
 * -- a confident lie about a user who has simply never opened Settings.
 */
export function resolveSignalDomains(stored: readonly unknown[] | null | undefined): readonly LifeDomain[] {
  if (stored == null) return DEFAULT_SIGNAL_DOMAINS;
  const valid = stored.filter(isLifeDomain);
  return valid.length > 0 ? valid : DEFAULT_SIGNAL_DOMAINS;
}

export function isSignalDomain(domain: LifeDomain, signalDomains: readonly LifeDomain[]): boolean {
  return signalDomains.includes(domain);
}
