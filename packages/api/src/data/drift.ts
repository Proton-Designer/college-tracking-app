import {
  detectDormantDimensions,
  detectHourSignals,
  detectRecrownedMits,
  detectUnderBaselineDays,
  selectConfrontation,
  type ConfrontationOffer,
  type DriftDimension,
  type DriftResponse,
  type DayFact,
  type DriftSignal,
  type DriftTrigger,
  type HourFact,
  type MitFact,
  type LocalDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DriftEventRow = Database['public']['Tables']['drift_events']['Row'];

/**
 * The drift confrontation data layer (D50).
 *
 * Every judgement is in `packages/core`; this gathers the facts and records what happened. Two
 * properties of the ordering here are deliberate:
 *
 * 1. **The rate limit is read before anything else is gathered.** If nothing may fire, this does no
 *    work at all — which matters because the common case by far is "nothing may fire", and a
 *    feature that queries five tables on every Today render to almost always return null would be
 *    a real cost for a rare event.
 * 2. **Nothing is written until a confrontation is actually SHOWN.** `recordShown` is called by the
 *    surface at display time, not here. A row in `drift_events` means a person saw something, which
 *    is what makes the rate limit auditable rather than merely intended.
 */

/**
 * How far back to look for a triggering event. Beyond this it is not news, and a confrontation
 * about something a week gone would be archaeology rather than a nudge.
 *
 * The MIT lookback is deliberately longer (14 days) because "crowned three nights running" is a
 * pattern that needs a window to be visible in at all.
 */
const SIGNAL_WINDOW_DAYS = 3;

export interface DriftContext {
  today: LocalDate;
  /** Per-user master switch. */
  enabled: boolean;
}

/**
 * Decides whether to confront, and returns the offer if so.
 *
 * Returns null far more often than not. That is the design working — see the four gates in
 * `selectConfrontation`, each of which is a reason to stay quiet.
 */
export async function findConfrontation(
  client: TypedSupabaseClient,
  userId: string,
  context: DriftContext,
): Promise<DataResult<ConfrontationOffer | null>> {
  if (!context.enabled) return dataOk(null);

  // The cheap gate first: if the rate limit forbids firing, gather nothing.
  const { data: lastEvent, error: lastError } = await client
    .from('drift_events')
    .select('local_date')
    .eq('user_id', userId)
    .order('shown_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return dataErr(mapDataError(lastError));

  const { data: dimensionRows, error: dimensionsError } = await client
    .from('dimensions')
    .select('id, name, drift_statement, drift_alerts_enabled')
    .eq('user_id', userId)
    .eq('archived', false)
    // A dimension with no statement can never fire, so it is filtered in the query rather than
    // fetched and discarded. The statement IS the opt-in.
    .not('drift_statement', 'is', null)
    .eq('drift_alerts_enabled', true);
  if (dimensionsError) return dataErr(mapDataError(dimensionsError));
  if (!dimensionRows || dimensionRows.length === 0) return dataOk(null);

  const dimensionIds = dimensionRows.map((d) => d.id);

  // Last act per dimension, for dormancy. Fetched only for the dimensions that could fire.
  const { data: routes, error: routesError } = await client
    .from('dimension_routes')
    .select('dimension_id, kind, match_value')
    .eq('user_id', userId)
    .in('dimension_id', dimensionIds);
  if (routesError) return dataErr(mapDataError(routesError));

  const sessionDomainsByDimension = new Map<number, Set<string>>();
  for (const route of routes ?? []) {
    if (route.kind !== 'session' || route.match_value === null) continue;
    const set = sessionDomainsByDimension.get(route.dimension_id) ?? new Set<string>();
    set.add(route.match_value);
    sessionDomainsByDimension.set(route.dimension_id, set);
  }

  const windowStart = shiftDate(context.today, -SIGNAL_WINDOW_DAYS);

  const { data: sessions, error: sessionsError } = await client
    .from('task_sessions')
    .select('id, domain, interruptions, status, deliverable, local_date')
    .eq('user_id', userId)
    .gte('local_date', windowStart)
    .lte('local_date', context.today);
  if (sessionsError) return dataErr(mapDataError(sessionsError));

  const hours: HourFact[] = (sessions ?? [])
    .filter((s) => s.local_date !== null)
    .map((s) => ({
      sessionId: s.id,
      dimensionId: dimensionForDomain(sessionDomainsByDimension, s.domain),
      distractions: s.interruptions ?? 0,
      status: s.status === 'abandoned' ? ('abandoned' as const) : ('completed' as const),
      hasDeliverable: (s.deliverable ?? '').trim().length > 0,
      date: s.local_date as LocalDate,
    }));

  const dimensions: DriftDimension[] = dimensionRows.map((d) => ({
    id: d.id,
    name: d.name,
    driftStatement: d.drift_statement,
    alertsEnabled: d.drift_alerts_enabled,
    lastActDate: null,
  }));

  // Days that closed under their own baseline, with the domain their Hours mostly served.
  const { data: dayRows, error: daysError } = await client
    .from('days')
    .select('local_date, baseline_hours')
    .eq('user_id', userId)
    .gte('local_date', windowStart)
    .lt('local_date', context.today);
  if (daysError) return dataErr(mapDataError(daysError));

  const dayFacts: DayFact[] = (dayRows ?? []).map((day) => {
    const dayHours = hours.filter((h) => h.date === day.local_date && h.status === 'completed');
    return {
      date: day.local_date as LocalDate,
      hoursCompleted: dayHours.length,
      baseline: day.baseline_hours,
      dimensionId: dominantDimension(dayHours),
    };
  });

  // An MIT crowned repeatedly and never done. `mit_rank = 1` is the crown; a task still open with
  // several planned dates behind it is the pattern.
  const { data: mitRows, error: mitError } = await client
    .from('tasks')
    .select('id, title, mit_rank, planned_date, completed_at, category')
    .eq('user_id', userId)
    .eq('mit_rank', 1)
    .is('completed_at', null)
    .gte('planned_date', shiftDate(context.today, -14))
    .lte('planned_date', context.today);
  if (mitError) return dataErr(mapDataError(mitError));

  const crowningsByTask = new Map<number, { title: string; count: number; category: string | null }>();
  for (const row of mitRows ?? []) {
    const entry = crowningsByTask.get(row.id) ?? {
      title: row.title,
      count: 0,
      category: row.category ?? null,
    };
    entry.count += 1;
    crowningsByTask.set(row.id, entry);
  }

  const mitFacts: MitFact[] = [...crowningsByTask.entries()].map(([taskId, entry]) => ({
    taskId,
    title: entry.title,
    dimensionId: dimensionForDomain(sessionDomainsByDimension, entry.category),
    consecutiveCrownings: entry.count,
  }));

  // Signals in priority order: something that just happened outranks a slow drift, because a
  // person can act on the Hour they just finished and cannot act on a fortnight.
  const signals: DriftSignal[] = [
    ...detectHourSignals(hours),
    ...detectRecrownedMits(mitFacts),
    ...detectUnderBaselineDays(dayFacts),
    ...detectDormantDimensions(dimensions, context.today),
  ];

  return dataOk(
    selectConfrontation({
      dimensions,
      signals,
      today: context.today,
      lastConfrontationDate: (lastEvent?.local_date as LocalDate | undefined) ?? null,
      enabled: context.enabled,
    }),
  );
}

/**
 * The dimension a day's Hours mostly served.
 *
 * Null on a tie or an empty day, deliberately: attributing a mixed day to one dimension would put a
 * confrontation behind a claim the data does not support, and a day with no Hours has no dimension
 * to attribute at all.
 */
function dominantDimension(dayHours: HourFact[]): number | null {
  const counts = new Map<number, number>();
  for (const hour of dayHours) {
    if (hour.dimensionId === null) continue;
    counts.set(hour.dimensionId, (counts.get(hour.dimensionId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let best: number | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [dimensionId, count] of counts) {
    if (count > bestCount) {
      best = dimensionId;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

function dimensionForDomain(
  byDimension: Map<number, Set<string>>,
  domain: string | null,
): number | null {
  if (domain === null) return null;
  for (const [dimensionId, domains] of byDimension) {
    if (domains.has(domain)) return dimensionId;
  }
  return null;
}

function shiftDate(date: LocalDate, days: number): LocalDate {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10) as LocalDate;
}

/**
 * Records that a confrontation was shown.
 *
 * Called by the surface at display time rather than by `findConfrontation`, so a row means a person
 * actually saw something. That is what makes the rate limit auditable — a promise nobody can check
 * is a hope.
 */
export async function recordShown(
  client: TypedSupabaseClient,
  userId: string,
  input: {
    dimensionId: number;
    trigger: DriftTrigger;
    localDate: LocalDate;
    evidence: Record<string, number | string>;
  },
): Promise<DataResult<DriftEventRow>> {
  const { data, error } = await client
    .from('drift_events')
    .insert({
      user_id: userId,
      dimension_id: input.dimensionId,
      trigger: input.trigger,
      local_date: input.localDate,
      evidence: input.evidence,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Records what the person did with it.
 *
 * `dismissed` is a first-class outcome and is NOT a failure: someone who reads their own words and
 * decides tonight is not the night has used the feature correctly. Nothing anywhere counts
 * dismissals or treats them as a pattern to escalate against.
 */
export async function recordResponse(
  client: TypedSupabaseClient,
  userId: string,
  eventId: number,
  response: DriftResponse,
  now: Date = new Date(),
): Promise<DataResult<DriftEventRow>> {
  const { data, error } = await client
    .from('drift_events')
    .update({ responded_with: response, responded_at: now.toISOString() })
    .eq('id', eventId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Writes or clears a dimension's drift statement. The app never authors this text. */
export async function setDriftStatement(
  client: TypedSupabaseClient,
  userId: string,
  dimensionId: number,
  statement: string | null,
): Promise<DataResult<true>> {
  const trimmed = statement === null ? null : statement.trim();
  const { error } = await client
    .from('dimensions')
    .update({ drift_statement: trimmed === '' ? null : trimmed })
    .eq('id', dimensionId)
    .eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(true);
}

/** The per-dimension off switch. One tap, permanent, no confirmation dialog. */
export async function setDriftAlertsEnabled(
  client: TypedSupabaseClient,
  userId: string,
  dimensionId: number,
  enabled: boolean,
): Promise<DataResult<true>> {
  const { error } = await client
    .from('dimensions')
    .update({ drift_alerts_enabled: enabled })
    .eq('id', dimensionId)
    .eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(true);
}
