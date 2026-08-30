import {
  bucketAllocation,
  resolveSignalDomains,
  resolveWindowState,
  summariseCoverage,
  unaccountedGaps,
  wastedMinutes,
  type AllocationRow,
  type AllocationWindow,
  type CoverageSummary,
  type EvidenceSpan,
  type LifeDomain,
  type LocalDate,
  type SignalNoiseTotals,
  type UnaccountedGap,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type AllocationCheckinRow = Database['public']['Tables']['allocation_checkins']['Row'];
export type CheckinAllocationRow = Database['public']['Tables']['checkin_allocations']['Row'];

/**
 * The Signal:Noise data layer.
 *
 * Every judgement lives in `packages/core/src/signal/allocation.ts`; this module only fetches rows
 * and hands them over. In particular **nothing here writes a window's state**: no cron marks a
 * window missed, no job converts silence into wasted minutes. A window with no row is unknown, and
 * unknown is resolved at read time from the clock and from whatever evidence exists (D33).
 */

/**
 * Builds the day's windows from the user's own check-in settings.
 *
 * Returns an empty array when the user has not set a window, which is the default and a real state
 * rather than an error: Signal:Noise simply has nothing to ask about until someone says which part
 * of their day they want accounted for. The Deen and Fitness surfaces take the same posture toward
 * an unset location and an unset plan.
 */
export function buildWindowsForDay(
  settings: {
    checkinWindowStart: string | null;
    checkinWindowEnd: string | null;
    checkinIntervalMinutes: number;
  },
  localDate: LocalDate,
  timeZone: string,
  localTimeToInstant: (date: LocalDate, hour: number, minute: number, tz: string) => string,
): { start: string; end: string }[] {
  const { checkinWindowStart, checkinWindowEnd, checkinIntervalMinutes } = settings;
  if (checkinWindowStart === null || checkinWindowEnd === null) return [];

  const parse = (value: string): [number, number] | null => {
    const match = /^(\d{2}):(\d{2})/.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2])];
  };

  const from = parse(checkinWindowStart);
  const to = parse(checkinWindowEnd);
  if (from === null || to === null) return [];

  const startMs = Date.parse(localTimeToInstant(localDate, from[0], from[1], timeZone));
  const endMs = Date.parse(localTimeToInstant(localDate, to[0], to[1], timeZone));
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return [];

  const stepMs = Math.max(30, checkinIntervalMinutes) * 60_000;
  const windows: { start: string; end: string }[] = [];
  // Bounded so a malformed setting cannot spin: a day holds at most 48 half-hour windows.
  for (let cursor = startMs, i = 0; cursor < endMs && i < 48; cursor += stepMs, i += 1) {
    windows.push({
      start: new Date(cursor).toISOString(),
      // The final window is clipped to the end of the day's span rather than overrunning it --
      // asking about time the user said was outside their window would be asking about sleep.
      end: new Date(Math.min(cursor + stepMs, endMs)).toISOString(),
    });
  }
  return windows;
}

export interface DaySignalView {
  windows: AllocationWindow[];
  coverage: CoverageSummary;
  totals: SignalNoiseTotals;
  /** Closed windows with no answer and no evidence -- what the Night Plan close-out asks about. */
  gaps: UnaccountedGap[];
  /** What pre-filled each covered window, so a surface can say WHY rather than only that. */
  evidence: EvidenceSpan[];
}

/**
 * Assembles one local day's Signal:Noise view.
 *
 * `evidence` is supplied by the caller rather than gathered here, and that is D33's boundary made
 * structural: only a source that already carries its own account of the time may pre-fill a window
 * -- a completed Hour has a deliverable and a domain, a logged prayer has a name and a span. This
 * function cannot invent evidence because it never looks for any.
 */
export async function loadDaySignal(
  client: TypedSupabaseClient,
  userId: string,
  input: {
    localDate: LocalDate;
    windows: { start: string; end: string }[];
    evidence: EvidenceSpan[];
    signalDomains: readonly unknown[] | null;
    windowMinutes: number;
  },
  now: Date = new Date(),
): Promise<DataResult<DaySignalView>> {
  const { data: checkins, error: checkinsError } = await client
    .from('allocation_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', input.localDate);
  if (checkinsError) return dataErr(mapDataError(checkinsError));

  const checkinIds = (checkins ?? []).map((c) => c.id);
  let allocations: CheckinAllocationRow[] = [];
  if (checkinIds.length > 0) {
    const { data, error } = await client
      .from('checkin_allocations')
      .select('*')
      .eq('user_id', userId)
      .in('checkin_id', checkinIds);
    if (error) return dataErr(mapDataError(error));
    allocations = data ?? [];
  }

  const answeredStarts = new Set(
    (checkins ?? []).filter((c) => c.answered_at !== null).map((c) => c.window_start),
  );

  const windows: AllocationWindow[] = input.windows.map((window) => ({
    ...window,
    state: resolveWindowState(
      window,
      answeredStarts.has(window.start),
      input.evidence,
      now,
    ),
  }));

  // Unaccounted minutes are derived per window, never stored -- see migration 57's header. A
  // window that was answered but under-allocated still leaves a real remainder, and that remainder
  // is what the ratio's noise side is made of.
  const rows: AllocationRow[] = allocations.map((a) => ({
    domain: a.domain as LifeDomain,
    minutes: a.minutes,
  }));
  for (const checkin of checkins ?? []) {
    const own = allocations.filter((a) => a.checkin_id === checkin.id);
    const assigned = Object.fromEntries(own.map((a) => [a.domain, a.minutes]));
    const remainder = wastedMinutes(
      {
        deen: assigned.deen ?? 0,
        business: assigned.business ?? 0,
        school: assigned.school ?? 0,
        fitness: assigned.fitness ?? 0,
        work: assigned.work ?? 0,
      },
      input.windowMinutes,
    );
    if (remainder > 0) rows.push({ domain: 'wasted', minutes: remainder });
  }

  return dataOk({
    windows,
    coverage: summariseCoverage(windows),
    totals: bucketAllocation(rows, resolveSignalDomains(input.signalDomains)),
    gaps: unaccountedGaps(windows, input.evidence, now),
    evidence: input.evidence,
  });
}

export interface SaveAllocationInput {
  localDate: LocalDate;
  windowStart: string;
  windowEnd: string;
  minutesByDomain: Partial<Record<LifeDomain, number>>;
  /** 'user' for an answer a person gave; otherwise the evidence that pre-filled it. */
  source?: string;
}

/**
 * Records one window's answer.
 *
 * `answered_at` is set only when the source is the user, which is what keeps a confession
 * distinguishable from a pre-fill in the coverage numbers. A zero-minute domain is not written --
 * the row's absence is how "this domain got none of this window" is represented, which is both
 * smaller and unambiguous.
 */
export async function saveAllocation(
  client: TypedSupabaseClient,
  userId: string,
  input: SaveAllocationInput,
  now: Date = new Date(),
): Promise<DataResult<AllocationCheckinRow>> {
  const source = input.source ?? 'user';
  const { data: checkin, error } = await client
    .from('allocation_checkins')
    .upsert(
      {
        user_id: userId,
        local_date: input.localDate,
        window_start: input.windowStart,
        window_end: input.windowEnd,
        source,
        answered_at: source === 'user' ? now.toISOString() : null,
      },
      { onConflict: 'user_id,window_start' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));

  // Replace rather than merge: the answer is a complete statement about the window, and a leftover
  // row from a previous answer would silently add minutes the user just removed.
  const { error: clearError } = await client
    .from('checkin_allocations')
    .delete()
    .eq('user_id', userId)
    .eq('checkin_id', checkin.id);
  if (clearError) return dataErr(mapDataError(clearError));

  const rows = Object.entries(input.minutesByDomain)
    .filter(([, minutes]) => typeof minutes === 'number' && minutes > 0)
    .map(([domain, minutes]) => ({
      user_id: userId,
      checkin_id: checkin.id,
      domain: domain as LifeDomain,
      minutes: minutes as number,
    }));

  if (rows.length > 0) {
    const { error: insertError } = await client.from('checkin_allocations').insert(rows);
    if (insertError) return dataErr(mapDataError(insertError));
  }

  return dataOk(checkin);
}
