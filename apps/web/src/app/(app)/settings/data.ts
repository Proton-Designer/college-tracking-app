import "server-only";
import {
  getBrightspaceFeedStatus,
  getMonthlySpend,
  getOwnProfile,
  listIntegrationStatuses,
  listKillHabits,
  listPendingIcsEvents,
  type BrightspaceFeedRow,
  type IcsEventExtractionRow,
  type IntegrationStatus,
  type KillHabitRow,
  type LlmMonthlySpend,
  type Profile,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface SettingsData {
  userId: string;
  profile: Profile;
  killHabits: KillHabitRow[];
  integrationStatuses: IntegrationStatus[];
  brightspaceFeed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null;
  /** E4: staged Brightspace deadlines awaiting explicit confirmation before they become
   *  real calendar_events -- CLAUDE.md law #3. Read regardless of whether a feed is
   *  currently connected, so a disconnect doesn't strand undecided items. */
  pendingIcsEvents: IcsEventExtractionRow[];
  monthlySpend: LlmMonthlySpend;
  /** Every agent_reports row for this user has model = 'deterministic' -- the model
   *  layer has never actually run, whether because no ANTHROPIC_API_KEY is configured
   *  or because nothing has triggered it yet. We can observe THIS (a real fact from
   *  data we're allowed to read), not the secret's existence itself (server-side only,
   *  never exposed to a client context) -- so the LLM budget panel reports what it can
   *  actually verify rather than guessing at why spend is zero. */
  hasEverCalledModel: boolean;
}

export type SettingsLoadResult = { ok: true; data: SettingsData } | { ok: false; error: string };

export async function loadSettingsData(): Promise<SettingsLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const [profileResult, killHabitsResult, integrationStatusesResult, brightspaceFeedResult, pendingIcsEventsResult, monthlySpendResult, modelUsageRow] =
    await Promise.all([
      getOwnProfile(client),
      listKillHabits(client, user.id, false),
      listIntegrationStatuses(client, user.id),
      getBrightspaceFeedStatus(client),
      listPendingIcsEvents(client),
      getMonthlySpend(client, user.id, new Date()),
      client.from("agent_reports").select("id").eq("user_id", user.id).neq("model", "deterministic").limit(1).maybeSingle(),
    ]);

  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  if (!killHabitsResult.ok) return { ok: false, error: killHabitsResult.error.message };
  if (!integrationStatusesResult.ok) return { ok: false, error: integrationStatusesResult.error.message };
  if (!brightspaceFeedResult.ok) return { ok: false, error: brightspaceFeedResult.error.message };
  if (!pendingIcsEventsResult.ok) return { ok: false, error: pendingIcsEventsResult.error.message };
  if (!monthlySpendResult.ok) return { ok: false, error: monthlySpendResult.error.message };

  return {
    ok: true,
    data: {
      userId: user.id,
      profile: profileResult.data,
      killHabits: killHabitsResult.data,
      integrationStatuses: integrationStatusesResult.data,
      brightspaceFeed: brightspaceFeedResult.data,
      pendingIcsEvents: pendingIcsEventsResult.data,
      monthlySpend: monthlySpendResult.data,
      hasEverCalledModel: modelUsageRow.data != null,
    },
  };
}
