"use server";

import { revalidatePath } from "next/cache";
import { createCard, updateCard, type CardType } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface CardsActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

export async function addCardAction(type: CardType, text: string): Promise<CardsActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await createCard(caller.client, caller.userId, { type, text });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/cards");
  return { ok: true };
}

/** Retire = active:false. The card keeps its history; it just stops rotating. */
export async function retireCardAction(cardId: number): Promise<CardsActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await updateCard(caller.client, caller.userId, cardId, { active: false });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/cards");
  return { ok: true };
}
