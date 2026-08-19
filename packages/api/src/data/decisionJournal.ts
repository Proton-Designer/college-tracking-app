import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DecisionJournalRow = Database['public']['Tables']['decision_journal']['Row'];

export interface LogDecisionInput {
  decision: string;
  rationale?: string;
  predictionPct?: number;
  predictedOutcome?: string;
  /** Defaults to now via the `occurred_at` column's own default -- only pass this to
   *  backdate a decision being logged after the fact. */
  occurredAt?: Date;
}

/** "Decision, reasoning, prediction, outcome scored later" -- same observe-then-score
 *  pattern as daily_predictions (DATA_MODEL.md §5). `local_date` is trigger-derived
 *  from `occurred_at` (sync_local_date_from_occurred_at), never computed here. */
export async function logDecision(
  client: TypedSupabaseClient,
  userId: string,
  input: LogDecisionInput,
): Promise<DataResult<DecisionJournalRow>> {
  const { data, error } = await client
    .from('decision_journal')
    .insert({
      user_id: userId,
      decision: input.decision,
      rationale: input.rationale ?? null,
      prediction_pct: input.predictionPct ?? null,
      predicted_outcome: input.predictedOutcome ?? null,
      // A BEFORE INSERT trigger (sync_local_date_from_occurred_at) unconditionally
      // overwrites this from occurred_at + the user's timezone -- the column has no DB
      // default, only a required generated-type placeholder here (same pattern as
      // killEvents.ts/frictionLogs.ts's logging functions).
      local_date: '1970-01-01',
      ...(input.occurredAt ? { occurred_at: input.occurredAt.toISOString() } : {}),
    })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface ScoreDecisionInput {
  actualOutcome: string;
}

/** Scores a prior decision against what actually happened -- a no-op-safe, idempotent
 *  update (re-scoring just overwrites the previous score and scored_at, same as
 *  scorePredictionForDate's own pattern). */
export async function scoreDecision(
  client: TypedSupabaseClient,
  decisionId: number,
  input: ScoreDecisionInput,
): Promise<DataResult<DecisionJournalRow>> {
  const { data, error } = await client
    .from('decision_journal')
    .update({ actual_outcome: input.actualOutcome, scored_at: new Date().toISOString() })
    .eq('id', decisionId)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function getDecision(client: TypedSupabaseClient, decisionId: number): Promise<DataResult<DecisionJournalRow | null>> {
  const { data, error } = await client.from('decision_journal').select('*').eq('id', decisionId).maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Most recent decisions, newest first. `unscoredOnly` surfaces decisions still
 *  awaiting an outcome -- the natural "close the loop" queue for a review UI. */
export async function listDecisions(
  client: TypedSupabaseClient,
  options: { unscoredOnly?: boolean; limit?: number } = {},
): Promise<DataResult<DecisionJournalRow[]>> {
  let query = client.from('decision_journal').select('*').order('occurred_at', { ascending: false });
  if (options.unscoredOnly) query = query.is('scored_at', null);
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
