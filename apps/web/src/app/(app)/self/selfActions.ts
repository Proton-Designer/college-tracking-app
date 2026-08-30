"use server";

import { createDimension, removeRoute, setRoute, updateDimension } from "@collegeos/api";
import type { EvidenceKind } from "@collegeos/core";
import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type SelfActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/**
 * Desired Self's write paths.
 *
 * Notice what is absent: there is no action that sets a standing, adjusts a score, or grants
 * points. The only things writable here are the dimensions themselves and the routing map that
 * says which acts feed them. Standing is computed from the acts every time it is read, so there is
 * nothing to write — which is the integrity constraint expressed as an API surface rather than as
 * a promise (D34).
 */

export async function createDimensionAction(input: {
  name: string;
  definition?: string;
  parentId?: number;
  ceiling?: number;
}): Promise<SelfActionResult<{ id: number }>> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await createDimension(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true, data: { id: result.data.id } };
}

export async function updateDimensionAction(
  dimensionId: number,
  patch: { name?: string; definition?: string | null; ceiling?: number | null; archived?: boolean },
): Promise<SelfActionResult<true>> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await updateDimension(caller.client, caller.userId, dimensionId, patch);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true, data: true };
}

export async function setRouteAction(input: {
  dimensionId: number;
  kind: EvidenceKind;
  matchValue: string | null;
  weight?: number;
}): Promise<SelfActionResult<true>> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await setRoute(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true, data: true };
}

export async function removeRouteAction(routeId: number): Promise<SelfActionResult<true>> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await removeRoute(caller.client, caller.userId, routeId);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true, data: true };
}
