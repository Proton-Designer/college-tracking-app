// Deterministic insight generation -- L7 item 5. detectCalibrationInsight
// (packages/core, mirrored) does the actual pattern detection; this file is the
// query/storage side, hand-ported from packages/api/src/day/calibration.ts's
// loadCalibrationObservations (same D16 scoping as domainQueries.ts -- the math is
// shared via the mirror, the query composition is duplicated).
//
// No model runs here at all -- this is pure code, so confidence_claimed_by_model is
// always null and confidence_stored is the code-gated tier directly (LLM_LAYER_SPEC.md
// §9's "stored tier = min(model_claimed, code_permitted)" degenerates to just
// code_permitted when there is no model claim to clamp against, which is the only case
// this environment can prove tonight -- a future model-proposed insight would go through
// the same clampInsightConfidence the schema already exists for, not a different path).

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { detectCalibrationInsight, localDateFromInstant, type DurationObservation } from "../core/index.ts";

const LOOKBACK_DAYS = 180;

async function loadCalibrationObservationsByCategory(
  client: AnySupabaseClient,
  userId: string,
  timezone: string,
  now: Date,
): Promise<Map<string, DurationObservation[]>> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("task_sessions")
    .select("planned_duration_min, actual_duration_min, created_at, tasks!inner(category, user_id)")
    .eq("tasks.user_id", userId)
    .eq("status", "completed") // see migration 0012 -- abandoned sessions never train calibration
    .gte("created_at", since);
  if (error) throw error;

  const byCategory = new Map<string, DurationObservation[]>();
  // deno-lint-ignore no-explicit-any
  for (const row of data ?? ([] as any[])) {
    const observation: DurationObservation = {
      estimatedMin: row.planned_duration_min,
      actualMin: row.actual_duration_min,
      completedAt: localDateFromInstant(new Date(row.created_at), timezone),
    };
    const category = row.tasks.category as string;
    const list = byCategory.get(category) ?? [];
    list.push(observation);
    byCategory.set(category, list);
  }
  return byCategory;
}

export interface StoredCalibrationInsight {
  category: string;
  insightId: number;
  confidenceStored: string;
}

/**
 * Runs the calibration-ratio-by-category detector for every category with enough
 * history and upserts each real finding into `insights`. `insights` has no unique
 * constraint to upsert against, so dedup is by a stable `detectorKey` embedded in the
 * jsonb `evidence` column (`calibration:<category>`) -- the claim text itself changes
 * night to night as the ratio shifts, so it can't be the dedup key.
 */
export async function detectAndStoreCalibrationInsights(
  client: AnySupabaseClient,
  userId: string,
  timezone: string,
  now: Date,
): Promise<StoredCalibrationInsight[]> {
  const byCategory = await loadCalibrationObservationsByCategory(client, userId, timezone, now);
  const stored: StoredCalibrationInsight[] = [];

  for (const [category, observations] of byCategory) {
    const candidate = detectCalibrationInsight(observations, category);
    if (!candidate) continue;

    const detectorKey = `calibration:${category}`;
    const evidence = { ...candidate.evidence, detectorKey, ratioPct: candidate.ratioPct, direction: candidate.direction };

    const { data: existing, error: findError } = await client
      .from("insights")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .contains("evidence", { detectorKey })
      .maybeSingle();
    if (findError) throw findError;

    const row = {
      user_id: userId,
      claim: candidate.claim,
      evidence,
      confidence_claimed_by_model: null,
      confidence_stored: candidate.confidence,
      sample_size: candidate.evidence.sampleSize,
      effect_size: candidate.evidence.effectSize,
      status: "active",
    };

    if (existing) {
      const { data, error } = await client.from("insights").update(row).eq("id", existing.id).select("id").single();
      if (error) throw error;
      stored.push({ category, insightId: data.id, confidenceStored: candidate.confidence });
    } else {
      const { data, error } = await client.from("insights").insert(row).select("id").single();
      if (error) throw error;
      stored.push({ category, insightId: data.id, confidenceStored: candidate.confidence });
    }
  }

  return stored;
}
