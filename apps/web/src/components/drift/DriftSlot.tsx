import { findConfrontation, getOwnProfile, recordShown } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { Confrontation } from "./Confrontation";

/**
 * The one place a confrontation can appear (D50).
 *
 * A server component, so the decision is made where the data is and nothing about drift reaches the
 * client unless something is actually being shown. On the overwhelming majority of days this
 * renders `null` and costs one indexed query — the rate-limit check short-circuits before any
 * signal gathering happens.
 *
 * **The row is written HERE, at render, not at decision time.** That is what makes the rate limit
 * auditable: a `drift_events` row means a person saw something. A promise nobody can check is a
 * hope, and "at most once every three days" is exactly the kind of promise that rots silently.
 *
 * A failure to record is deliberately swallowed rather than shown. If the write fails the
 * confrontation simply does not appear this time — which is the safe direction. Surfacing a
 * database error on top of someone's own words about their worst self would be the single worst
 * error state in the app.
 */
export async function DriftSlot({ today }: { today: string }) {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;

  const profile = await getOwnProfile(client);
  if (!profile.ok) return null;

  const offer = await findConfrontation(client, user.id, { today, enabled: true });
  if (!offer.ok || offer.data === null) return null;

  const event = await recordShown(client, user.id, {
    dimensionId: offer.data.dimensionId,
    trigger: offer.data.trigger,
    localDate: today,
    evidence: offer.data.evidenceData,
  });
  if (!event.ok) return null;

  return <Confrontation offer={offer.data} eventId={event.data.id} />;
}
