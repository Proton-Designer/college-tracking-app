/**
 * Normalizes WHOOP API/webhook payloads into the generic telemetry_events shape
 * (`{source, type, metric, value, unit, occurredAt}`) -- the brief's point about L10's
 * generic ingest sink: a new data source should never need a schema change. Pure,
 * no I/O, so the mapping itself is fully provable offline tonight even with zero WHOOP
 * credentials -- only the actual HTTP call (in the Edge Function) is untestable here.
 *
 * Payload shapes follow WHOOP's publicly documented API v2 response format (sleep,
 * recovery, cycle/strain, workout collections) as of this build -- **recorded, not
 * verified live**, same honesty as the LLM gateway's Anthropic contract tests (no real
 * API call has ever been made against it in this environment). If the real shape has
 * drifted by the time a WHOOP key exists, update these fixtures/mappers from the real
 * response, never patch a test to force it to pass (docs/SUPABASE_SETUP.md's own rule
 * for exactly this situation).
 */

export interface TelemetryEventInput {
  source: string;
  type: string;
  metric: string;
  value: number;
  unit: string | null;
  occurredAt: string; // ISO instant
}

export interface WhoopSleepPayload {
  id: string;
  start: string;
  end: string;
  score: {
    sleep_performance_percentage: number | null;
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
    };
  } | null;
}

export function normalizeWhoopSleep(payload: WhoopSleepPayload): TelemetryEventInput[] {
  const events: TelemetryEventInput[] = [];
  if (payload.score?.stage_summary) {
    const asleepMs = payload.score.stage_summary.total_in_bed_time_milli - payload.score.stage_summary.total_awake_time_milli;
    events.push({ source: "whoop", type: "sleep", metric: "sleep_hours", value: Math.round((asleepMs / 3_600_000) * 100) / 100, unit: "hours", occurredAt: payload.end });
  }
  if (payload.score?.sleep_performance_percentage != null) {
    events.push({ source: "whoop", type: "sleep", metric: "sleep_performance_pct", value: payload.score.sleep_performance_percentage, unit: "percent", occurredAt: payload.end });
  }
  return events;
}

export interface WhoopRecoveryPayload {
  cycle_id: number;
  created_at: string;
  score: {
    recovery_score: number | null;
    hrv_rmssd_milli: number | null;
    resting_heart_rate: number | null;
  } | null;
}

export function normalizeWhoopRecovery(payload: WhoopRecoveryPayload): TelemetryEventInput[] {
  const events: TelemetryEventInput[] = [];
  if (payload.score?.recovery_score != null) {
    events.push({ source: "whoop", type: "recovery", metric: "recovery_pct", value: payload.score.recovery_score, unit: "percent", occurredAt: payload.created_at });
  }
  if (payload.score?.hrv_rmssd_milli != null) {
    events.push({ source: "whoop", type: "recovery", metric: "hrv_ms", value: payload.score.hrv_rmssd_milli, unit: "ms", occurredAt: payload.created_at });
  }
  if (payload.score?.resting_heart_rate != null) {
    events.push({ source: "whoop", type: "recovery", metric: "resting_hr", value: payload.score.resting_heart_rate, unit: "bpm", occurredAt: payload.created_at });
  }
  return events;
}

export interface WhoopWorkoutPayload {
  id: string;
  start: string;
  end: string;
  score: {
    strain: number | null;
  } | null;
}

export function normalizeWhoopWorkout(payload: WhoopWorkoutPayload): TelemetryEventInput[] {
  const events: TelemetryEventInput[] = [
    { source: "whoop", type: "workout", metric: "workout_completed", value: 1, unit: null, occurredAt: payload.end },
  ];
  if (payload.score?.strain != null) {
    events.push({ source: "whoop", type: "workout", metric: "strain", value: payload.score.strain, unit: null, occurredAt: payload.end });
  }
  return events;
}
