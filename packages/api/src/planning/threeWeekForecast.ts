import {
  addDays,
  buildExamCurve,
  buildLoadForecast,
  compareLocalDate,
  FORECAST_HORIZON_DAYS,
  type LoadForecast,
  type PlannedDayLoad,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

/**
 * The 3-week load forecast's data assembly (BLUEPRINT 5.5, D25). Planned minutes come
 * from, in priority order per deliverable:
 *
 *   1. Its persisted backplan milestones (real dates, real minutes -- the user
 *      generated them and may have completed some).
 *   2. For an exam/quiz WITHOUT a backplan: its derived retrieval curve, at one Hour
 *      (60 min) per session -- the product's own unit of planned work.
 *
 * Never both for one deliverable: that would double-count the same preparation.
 * weekly_plan_blocks are deliberately excluded for the same reason -- blocks are placed
 * FROM these same deliverables, and a forecast that counts the plan and the plan's
 * placement twice warns about collisions that do not exist.
 */

export interface ThreeWeekForecastResult {
  forecast: LoadForecast;
  /** How many deliverables contributed via each source -- the explanation trace. */
  sources: { backplanned: number; examCurves: number };
}

const EXAM_CURVE_SESSION_MINUTES = 60;

export async function loadThreeWeekForecast(
  client: TypedSupabaseClient,
  userId: string,
  today: string,
): Promise<DataResult<ThreeWeekForecastResult>> {
  const horizonEnd = addDays(today, FORECAST_HORIZON_DAYS);

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('weekday_baselines')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  const { data: deliverables, error: delivError } = await client
    .from('deliverables')
    .select('id, type, local_due_date, status')
    .eq('user_id', userId)
    .neq('status', 'completed')
    .gte('local_due_date', today);
  if (delivError) return dataErr(mapDataError(delivError));
  const open = deliverables ?? [];

  const { data: backplans, error: backplanError } = await client
    .from('deliverable_backplans')
    .select('id, deliverable_id')
    .eq('user_id', userId)
    .in('deliverable_id', open.map((d) => d.id));
  if (backplanError) return dataErr(mapDataError(backplanError));
  const backplanByDeliverable = new Map((backplans ?? []).map((b) => [b.deliverable_id, b.id]));

  const planned: PlannedDayLoad[] = [];
  let backplannedCount = 0;
  let curveCount = 0;

  if (backplanByDeliverable.size > 0) {
    const { data: milestones, error: milestoneError } = await client
      .from('backplan_milestones')
      .select('milestone_date, minutes, completed, backplan_id')
      .eq('user_id', userId)
      .in('backplan_id', [...backplanByDeliverable.values()]);
    if (milestoneError) return dataErr(mapDataError(milestoneError));
    backplannedCount = backplanByDeliverable.size;
    for (const m of milestones ?? []) {
      if (m.completed) continue; // done work is not upcoming load
      if (compareLocalDate(m.milestone_date, today) < 0 || compareLocalDate(m.milestone_date, horizonEnd) >= 0) continue;
      planned.push({ date: m.milestone_date, minutes: m.minutes });
    }
  }

  for (const deliverable of open) {
    if (deliverable.type !== 'exam' && deliverable.type !== 'quiz') continue;
    if (backplanByDeliverable.has(deliverable.id)) continue;
    const curve = buildExamCurve(today, deliverable.local_due_date);
    if (curve.sessions.length === 0) continue;
    curveCount++;
    for (const session of curve.sessions) {
      if (compareLocalDate(session.date, horizonEnd) >= 0) continue;
      planned.push({ date: session.date, minutes: EXAM_CURVE_SESSION_MINUTES });
    }
  }

  const forecast = buildLoadForecast(
    today,
    planned,
    (profile.weekday_baselines ?? null) as Record<string, unknown> | null,
  );

  return dataOk({ forecast, sources: { backplanned: backplannedCount, examCurves: curveCount } });
}
