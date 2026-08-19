// The semester retrospective -- distinct from the nightly/weekly synthesis, and
// distinct from the L7 nightly insight *detection* pass. Two jobs, both deterministic,
// no model call:
//
// 1. Promote insights into durable semester_lessons -- but ONLY the highest-confidence
//    ones. Durable lessons feed every future nightly call's cached context
//    (loadDurableProfile), so promoting a weak observation would poison that context
//    permanently. Re-gates each insight against its OWN stored evidence via
//    gateInsightConfidence (the exact function the nightly detector already uses,
//    never a separate/looser threshold) rather than trusting confidence_stored, since
//    that tier may have been computed months ago against different data and shouldn't
//    be grandfathered into permanence.
//
// 2. The self-audit the brief's meta-rule requires: "if a metric does not influence a
//    decision for 30 days, flag it for deletion." Operationalized concretely: any
//    active insight at least 30 days old that has never had an experiment created from
//    it. That's the honest, queryable definition of "never influenced a decision" this
//    schema can actually support -- an insight nobody ever tested is a metric sitting
//    idle, exactly the kind of thing this pass exists to surface.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { daysBetween, gateInsightConfidence, localDateFromInstant, type InsightConfidenceLevel, type InsightEvidenceInput } from "../core/index.ts";

const STALE_THRESHOLD_DAYS = 30;

export interface PromotedLesson {
  insightId: number;
  lessonId: number;
  confidence: InsightConfidenceLevel;
}

export interface StaleUnactionedInsight {
  insightId: number;
  claim: string;
  daysSinceCreated: number;
}

export interface SemesterRetrospectiveResult {
  term: string;
  promotedLessons: PromotedLesson[];
  staleUnactionedInsights: StaleUnactionedInsight[];
}

/** Loose runtime check -- `insights.evidence` is jsonb with no DB-level shape
 *  guarantee. seed.sql's hand-authored insights carry a free-form evidence object
 *  (e.g. `{"observedRatio":1.28}`) that predates this shape entirely; gating against a
 *  malformed/partial object degrades safely (every InsightEvidenceInput field
 *  comparison against `undefined` is simply `false`, never a crash), landing such
 *  insights at 'testing' and correctly refusing to promote them -- but this check
 *  skips them outright rather than relying on that fallthrough, so the reason ("no
 *  structured evidence to re-gate") is explicit rather than incidental. */
function isRegatableEvidence(evidence: unknown): evidence is InsightEvidenceInput {
  if (evidence == null || typeof evidence !== "object") return false;
  const e = evidence as Record<string, unknown>;
  return (
    typeof e.sampleSize === "number" &&
    typeof e.effectHoldsInBothHalves === "boolean" &&
    typeof e.effectSize === "number" &&
    typeof e.noiseFloor === "number" &&
    typeof e.consistentDirection === "boolean"
  );
}

export async function runSemesterRetrospective(
  client: AnySupabaseClient,
  userId: string,
  term: string,
  now: Date,
): Promise<SemesterRetrospectiveResult> {
  const { data: profile, error: profileError } = await client.from("profiles").select("timezone").eq("id", userId).single();
  if (profileError) throw profileError;
  const today = localDateFromInstant(now, profile.timezone);

  const [{ data: insights, error: insightsError }, { data: experimentLinks, error: experimentsError }] = await Promise.all([
    client.from("insights").select("id, claim, evidence, created_at").eq("user_id", userId).eq("status", "active"),
    client.from("experiments").select("insight_id").eq("user_id", userId),
  ]);
  if (insightsError) throw insightsError;
  if (experimentsError) throw experimentsError;

  const experimentedInsightIds = new Set(
    // deno-lint-ignore no-explicit-any
    (experimentLinks ?? []).map((e: any) => e.insight_id).filter((id: number | null): id is number => id != null),
  );

  const promotedLessons: PromotedLesson[] = [];
  const staleUnactionedInsights: StaleUnactionedInsight[] = [];

  // deno-lint-ignore no-explicit-any
  for (const insight of insights ?? ([] as any[])) {
    if (isRegatableEvidence(insight.evidence)) {
      const regatedConfidence = gateInsightConfidence(insight.evidence);
      // "Carry only the highest-confidence lessons forward" -- durable means it shapes
      // every future nightly call, so the bar is 'high', not merely "still passes the gate."
      if (regatedConfidence === "high") {
        const { data: lessonRow, error: lessonError } = await client
          .from("semester_lessons")
          .insert({ user_id: userId, term, lesson: insight.claim, confidence: regatedConfidence, source_insight_id: insight.id })
          .select("id")
          .single();
        if (lessonError) throw lessonError;
        promotedLessons.push({ insightId: insight.id, lessonId: lessonRow.id, confidence: regatedConfidence });
      }
    }

    if (!experimentedInsightIds.has(insight.id)) {
      const insightLocalDate = localDateFromInstant(new Date(insight.created_at), profile.timezone);
      const daysSinceCreated = daysBetween(insightLocalDate, today);
      if (daysSinceCreated >= STALE_THRESHOLD_DAYS) {
        staleUnactionedInsights.push({ insightId: insight.id, claim: insight.claim, daysSinceCreated });
      }
    }
  }

  return { term, promotedLessons, staleUnactionedInsights };
}
