import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Experiment = Database['public']['Tables']['experiments']['Row'];
export type ExperimentMeasurementRow = Database['public']['Tables']['experiment_measurements']['Row'];

export interface CreateExperimentInput {
  /** The insight this trial is testing. Most naturally a `testing`-tier insight --
   *  correlation strong enough to be worth an N-of-1 trial, not yet strong enough to
   *  act on as fact (DOMAIN_ENGINE_SPEC.md §10) -- but any active insight may be
   *  converted; nothing here hard-gates on confidence tier. */
  insightId: number;
  hypothesis: string;
  protocol?: string;
  startDate: LocalDate;
  endDate?: LocalDate;
}

/** "Observe → hypothesize → N-of-1 experiment → measure" -- the brief's alternative to
 *  a correlation-hallucination machine. Starts `status: 'running'`. */
export async function createExperiment(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateExperimentInput,
): Promise<DataResult<Experiment>> {
  const { data, error } = await client
    .from('experiments')
    .insert({
      user_id: userId,
      insight_id: input.insightId,
      hypothesis: input.hypothesis,
      protocol: input.protocol ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      status: 'running',
    })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function getExperiment(client: TypedSupabaseClient, experimentId: number): Promise<DataResult<Experiment | null>> {
  const { data, error } = await client.from('experiments').select('*').eq('id', experimentId).maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listExperiments(client: TypedSupabaseClient, status?: string): Promise<DataResult<Experiment[]>> {
  let query = client.from('experiments').select('*').order('start_date', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface LogExperimentMeasurementInput {
  experimentId: number;
  metric: string;
  value: number;
  localDate: LocalDate;
}

/** One day's reading for a running trial's metric. Deliberately just a fact log --
 *  scoring (computeExperimentOutcome, packages/core) is a separate, pure read over the
 *  accumulated rows, not something this write computes or decides. */
export async function logExperimentMeasurement(
  client: TypedSupabaseClient,
  userId: string,
  input: LogExperimentMeasurementInput,
): Promise<DataResult<ExperimentMeasurementRow>> {
  const { data, error } = await client
    .from('experiment_measurements')
    .insert({ user_id: userId, experiment_id: input.experimentId, metric: input.metric, value: input.value, local_date: input.localDate })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listExperimentMeasurements(
  client: TypedSupabaseClient,
  experimentId: number,
): Promise<DataResult<ExperimentMeasurementRow[]>> {
  const { data, error } = await client
    .from('experiment_measurements')
    .select('*')
    .eq('experiment_id', experimentId)
    .order('local_date');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface ScoreExperimentInput {
  status: 'completed' | 'abandoned';
  outcomeSummary: string;
  /** Defaults to today if not given -- closing the trial is what sets the end date if
   *  one wasn't fixed up front. */
  endDate?: LocalDate;
}

/** Closes a trial with a real, human-legible summary of what happened -- the
 *  deterministic side (computeExperimentOutcome's confidence/direction verdict) is
 *  meant to inform this text, not replace it; the summary is written by whatever
 *  caller assembled the outcome (UI, or eventually a model call), not derived here. */
export async function scoreExperiment(
  client: TypedSupabaseClient,
  experimentId: number,
  input: ScoreExperimentInput,
): Promise<DataResult<Experiment>> {
  const { data, error } = await client
    .from('experiments')
    .update({
      status: input.status,
      outcome_summary: input.outcomeSummary,
      end_date: input.endDate ?? new Date().toISOString().slice(0, 10),
    })
    .eq('id', experimentId)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
