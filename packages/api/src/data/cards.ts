import type { RotationCard } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type CardRow = Database['public']['Tables']['cards']['Row'];
export type CardType = Database['public']['Enums']['card_type'];

export interface CreateCardInput {
  type: CardType;
  text: string;
}

export interface UpdateCardInput {
  text?: string;
  /** 0 removes the card from rotation without deleting it. */
  weight?: number;
  active?: boolean;
}

/** The whole library, active first, newest within each group. */
export async function listCards(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<CardRow[]>> {
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('user_id', userId)
    .order('active', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function createCard(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateCardInput,
): Promise<DataResult<CardRow>> {
  const text = input.text.trim();
  if (text.length === 0) {
    return dataErr({ code: 'validation', message: 'A card needs text.' });
  }
  const { data, error } = await client
    .from('cards')
    .insert({ user_id: userId, type: input.type, text })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function updateCard(
  client: TypedSupabaseClient,
  userId: string,
  cardId: number,
  input: UpdateCardInput,
): Promise<DataResult<CardRow>> {
  const { data, error } = await client
    .from('cards')
    .update({
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq('id', cardId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * The active library mapped into the rotation's domain shape. The End-of-Hour flow calls
 * this once and hands the result to packages/core's pickRotation -- the weighted choice is
 * core's job, the fetch is this layer's, and neither does the other's.
 */
export async function listRotationCards(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<RotationCard[]>> {
  const { data, error } = await client
    .from('cards')
    .select('id, type, text, weight')
    .eq('user_id', userId)
    .eq('active', true);
  if (error) return dataErr(mapDataError(error));
  return dataOk(
    (data ?? []).map((row) => ({ id: row.id, type: row.type, text: row.text, weight: Number(row.weight) })),
  );
}
