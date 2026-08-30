import {
  attentionThisWeek,
  dimensionStanding,
  routeActs,
  type DimensionStanding,
  type EvidenceKind,
  type LocalDate,
  type RoutableAct,
  type RouteRule,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DimensionRow = Database['public']['Tables']['dimensions']['Row'];
export type DimensionRouteRow = Database['public']['Tables']['dimension_routes']['Row'];

/**
 * Desired Self's data layer.
 *
 * **There is no score to fetch.** No table stores one, and this module computes standings from the
 * acts that fed them every time it is asked. That is the integrity constraint, not a performance
 * choice: a stored score is a currency, and a currency is a thing to optimise instead of the thing
 * being measured. The acts come back attached to the number, so no surface can render a bare score
 * even by accident.
 */

/** How far back evidence is gathered. Beyond this the decay has made an act irrelevant anyway. */
const EVIDENCE_WINDOW_DAYS = 90;

export interface SelfView {
  dimensions: DimensionRow[];
  standings: DimensionStanding[];
  /** Act counts per dimension this week -- the ONLY legitimate cross-dimension view (D34). */
  attention: { dimensionId: number; name: string; acts: number }[];
  /** Acts that matched no routing rule. Surfaced so an unfinished map is visible, not silent. */
  unroutedActs: number;
}

/**
 * Gathers the week's-to-quarter's acts and routes them.
 *
 * Each source is queried for its own shape and flattened into `RoutableAct`s with a human label,
 * because the label is what a dimension's evidence stream shows. A row that cannot describe itself
 * in a sentence has no business feeding a number someone is meant to trust.
 */
export async function loadSelf(
  client: TypedSupabaseClient,
  userId: string,
  input: { today: LocalDate; windowStart: LocalDate },
): Promise<DataResult<SelfView>> {
  const { data: dimensions, error: dimensionsError } = await client
    .from('dimensions')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('sort_order', { ascending: true });
  if (dimensionsError) return dataErr(mapDataError(dimensionsError));

  const { data: routeRows, error: routesError } = await client
    .from('dimension_routes')
    .select('*')
    .eq('user_id', userId);
  if (routesError) return dataErr(mapDataError(routesError));

  const rules: RouteRule[] = (routeRows ?? []).map((row) => ({
    dimensionId: row.dimension_id,
    kind: row.kind as EvidenceKind,
    matchValue: row.match_value,
    weight: Number(row.weight),
  }));

  const actsResult = await gatherActs(client, userId, input.windowStart, input.today);
  if (!actsResult.ok) return actsResult;
  const acts = actsResult.data;

  const routed = routeActs(acts, rules);

  const standings = (dimensions ?? []).map((dimension) =>
    dimensionStanding({
      dimension: {
        id: dimension.id,
        name: dimension.name,
        parentId: dimension.parent_id,
        ceiling: dimension.ceiling === null ? null : Number(dimension.ceiling),
      },
      acts: routed.get(dimension.id) ?? [],
      today: input.today,
      windowDays: EVIDENCE_WINDOW_DAYS,
    }),
  );

  const routedActCount = [...routed.values()].reduce((sum, list) => sum + list.length, 0);

  return dataOk({
    dimensions: dimensions ?? [],
    standings,
    attention: attentionThisWeek(standings),
    // An act can route to several dimensions, so this is a floor on what is unrouted rather than an
    // exact count -- and a floor is the honest thing to show: it never overstates the gap.
    unroutedActs: Math.max(0, acts.length - Math.min(acts.length, routedActCount)),
  });
}

/**
 * Every act in the window, from every source that can feed a dimension.
 *
 * Deliberately reads the same tables the rest of the app writes rather than a summary table. There
 * is no `self_events` feed to keep in sync, so a dimension cannot disagree with the surface an act
 * came from — the failure mode C4 refused for due dates, and the reason `experiments` is reused for
 * the Learn bridge instead of a second trial mechanism.
 */
async function gatherActs(
  client: TypedSupabaseClient,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<DataResult<RoutableAct[]>> {
  const acts: RoutableAct[] = [];

  const { data: sessions, error: sessionsError } = await client
    .from('task_sessions')
    .select('local_date, domain, deliverable, session_type')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('local_date', from)
    .lte('local_date', to);
  if (sessionsError) return dataErr(mapDataError(sessionsError));
  for (const row of sessions ?? []) {
    if (row.local_date === null) continue;
    acts.push({
      kind: 'session',
      date: row.local_date,
      label: row.deliverable ? `Session — ${row.deliverable}` : 'Session',
      matchValue: row.domain,
    });
  }

  const { data: prayers, error: prayersError } = await client
    .from('prayers')
    .select('local_date, prayer_name, status')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to)
    .in('status', ['on_time', 'qada']);
  if (prayersError) return dataErr(mapDataError(prayersError));
  for (const row of prayers ?? []) {
    acts.push({
      kind: 'prayer',
      date: row.local_date,
      label: `${row.prayer_name} ${row.status === 'on_time' ? 'on time' : 'made up'}`,
      matchValue: row.prayer_name,
    });
  }

  const { data: quran, error: quranError } = await client
    .from('quran_sessions')
    .select('local_date, pages_read, surah')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to);
  if (quranError) return dataErr(mapDataError(quranError));
  for (const row of quran ?? []) {
    const detail = row.pages_read != null ? `${row.pages_read} pages` : (row.surah ?? 'session');
    acts.push({ kind: 'quran_session', date: row.local_date, label: `Qur'an — ${detail}`, matchValue: null });
  }

  const { data: habitLogs, error: habitsError } = await client
    .from('habit_logs')
    .select('local_date, habit_id, done')
    .eq('user_id', userId)
    // Only a vote FOR the identity is an act. A logged miss is honest data the habit score
    // needs, but it is not evidence that a dimension was served.
    .eq('done', true)
    .gte('local_date', from)
    .lte('local_date', to);
  if (habitsError) return dataErr(mapDataError(habitsError));
  for (const row of habitLogs ?? []) {
    acts.push({
      kind: 'habit_log',
      date: row.local_date,
      label: 'Habit vote',
      matchValue: String(row.habit_id),
    });
  }

  const { data: workouts, error: workoutsError } = await client
    .from('workout_sessions')
    .select('local_date, id, confirmed_at')
    .eq('user_id', userId)
    .not('confirmed_at', 'is', null)
    .gte('local_date', from)
    .lte('local_date', to);
  if (workoutsError) return dataErr(mapDataError(workoutsError));
  for (const row of workouts ?? []) {
    // One act per confirmed session rather than per set: a dimension should move because you
    // trained, not because you logged your sets in more rows than usual.
    acts.push({ kind: 'workout_set', date: row.local_date, label: 'Workout confirmed', matchValue: null });
  }

  const { data: metrics, error: metricsError } = await client
    .from('body_metrics')
    .select('local_date, weight_lb, waist_in')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to);
  if (metricsError) return dataErr(mapDataError(metricsError));
  for (const row of metrics ?? []) {
    acts.push({ kind: 'body_metric', date: row.local_date, label: 'Measurement logged', matchValue: null });
  }

  const { data: reviews, error: reviewsError } = await client
    .from('lesson_reviews')
    .select('local_date, card_id, lesson_cards!inner(lesson_id, lessons!inner(source_id, title))')
    .eq('user_id', userId)
    .gte('local_date', from)
    .lte('local_date', to);
  if (reviewsError) return dataErr(mapDataError(reviewsError));
  type JoinedReview = {
    local_date: string;
    lesson_cards: { lessons: { source_id: number; title: string } };
  };
  for (const row of (reviews ?? []) as unknown as JoinedReview[]) {
    acts.push({
      kind: 'lesson_review',
      date: row.local_date,
      label: `Reviewed — ${row.lesson_cards.lessons.title}`,
      matchValue: String(row.lesson_cards.lessons.source_id),
    });
  }

  const { data: experiments, error: experimentsError } = await client
    .from('experiments')
    .select('id, hypothesis, start_date, lesson_id')
    .eq('user_id', userId)
    .gte('start_date', from)
    .lte('start_date', to);
  if (experimentsError) return dataErr(mapDataError(experimentsError));
  for (const row of experiments ?? []) {
    acts.push({
      kind: 'experiment',
      date: row.start_date,
      // The knowing-to-doing bridge landing. Named as such so the evidence stream shows it.
      label: row.lesson_id != null ? `Tried a lesson — ${row.hypothesis}` : `Experiment — ${row.hypothesis}`,
      matchValue: row.lesson_id != null ? String(row.lesson_id) : null,
    });
  }

  return dataOk(acts);
}

export interface CreateDimensionInput {
  name: string;
  definition?: string;
  parentId?: number;
  ceiling?: number;
}

export async function createDimension(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateDimensionInput,
): Promise<DataResult<DimensionRow>> {
  const name = input.name.trim();
  if (name.length === 0) {
    return dataErr({ code: 'validation', message: 'A dimension needs a name.' });
  }

  const { data, error } = await client
    .from('dimensions')
    .insert({
      user_id: userId,
      name,
      ...(input.definition != null && input.definition.trim().length > 0
        ? { definition: input.definition.trim() }
        : {}),
      ...(input.parentId != null ? { parent_id: input.parentId } : {}),
      ...(input.ceiling != null ? { ceiling: input.ceiling } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function updateDimension(
  client: TypedSupabaseClient,
  userId: string,
  dimensionId: number,
  patch: { name?: string; definition?: string | null; ceiling?: number | null; archived?: boolean },
): Promise<DataResult<DimensionRow>> {
  const { data, error } = await client
    .from('dimensions')
    .update({
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.definition !== undefined ? { definition: patch.definition } : {}),
      ...(patch.ceiling !== undefined ? { ceiling: patch.ceiling } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
    })
    .eq('id', dimensionId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function setRoute(
  client: TypedSupabaseClient,
  userId: string,
  input: { dimensionId: number; kind: EvidenceKind; matchValue: string | null; weight?: number },
): Promise<DataResult<DimensionRouteRow>> {
  const { data, error } = await client
    .from('dimension_routes')
    .upsert(
      {
        user_id: userId,
        dimension_id: input.dimensionId,
        kind: input.kind,
        match_value: input.matchValue,
        ...(input.weight != null ? { weight: input.weight } : {}),
      },
      { onConflict: 'user_id,dimension_id,kind,match_value' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function removeRoute(
  client: TypedSupabaseClient,
  userId: string,
  routeId: number,
): Promise<DataResult<true>> {
  const { error } = await client
    .from('dimension_routes')
    .delete()
    .eq('id', routeId)
    .eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(true);
}

export async function listRoutes(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<DimensionRouteRow[]>> {
  const { data, error } = await client
    .from('dimension_routes')
    .select('*')
    .eq('user_id', userId)
    .order('dimension_id', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}
