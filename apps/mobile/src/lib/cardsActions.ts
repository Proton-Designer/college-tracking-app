import {
  createCard,
  listCards,
  listRotationCards,
  updateCard,
  type CardRow,
  type CardType,
} from "@collegeos/api";
import { pickRotation, type RotationCard } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface CardsActionResult {
  ok: boolean;
  error?: string;
}

export async function loadCards(
  userId: string,
): Promise<{ ok: true; data: CardRow[] } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const result = await listCards(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addCard(userId: string, type: CardType, text: string): Promise<CardsActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createCard(client, userId, { type, text });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Retire = active:false. The card keeps its history; it just stops rotating. */
export async function retireCard(userId: string, cardId: number): Promise<CardsActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateCard(client, userId, cardId, { active: false });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/**
 * The End-of-Hour draw: fetch the active library, let core pick one per slot.
 * An empty result is a legitimate answer (new user, empty library) -- the End-of-Hour
 * flow shows a shorter ritual rather than an error.
 */
export async function drawRotation(
  userId: string,
): Promise<{ ok: true; data: RotationCard[] } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const result = await listRotationCards(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: pickRotation(result.data) };
}
