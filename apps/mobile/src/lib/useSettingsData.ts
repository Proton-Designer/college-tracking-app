import {
  getBrightspaceFeedStatus,
  getMonthlySpend,
  getOwnProfile,
  listIntegrationStatuses,
  listKillHabits,
  type BrightspaceFeedRow,
  type IntegrationStatus,
  type KillHabitRow,
  type LlmMonthlySpend,
  type Profile,
} from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface SettingsData {
  userId: string;
  profile: Profile;
  killHabits: KillHabitRow[];
  integrationStatuses: IntegrationStatus[];
  brightspaceFeed: Pick<BrightspaceFeedRow, "id" | "last_synced_at"> | null;
  monthlySpend: LlmMonthlySpend;
  hasEverCalledModel: boolean;
}

export type SettingsFetchState = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: SettingsData };

/** Mirrors apps/web/src/app/(app)/settings/data.ts's loadSettingsData exactly -- same
 *  sources, same "has this account ever actually called the model" honesty check. */
export function useSettingsData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<SettingsFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    Promise.all([
      getOwnProfile(client),
      listKillHabits(client, userId, false),
      listIntegrationStatuses(client, userId),
      getBrightspaceFeedStatus(client),
      getMonthlySpend(client, userId, new Date()),
      client.from("agent_reports").select("id").eq("user_id", userId).neq("model", "deterministic").limit(1).maybeSingle(),
    ]).then(([profileResult, killHabitsResult, integrationStatusesResult, brightspaceFeedResult, monthlySpendResult, modelUsageRow]) => {
      if (cancelled) return;
      if (!profileResult.ok) return setFetchState({ status: "error", error: profileResult.error.message });
      if (!killHabitsResult.ok) return setFetchState({ status: "error", error: killHabitsResult.error.message });
      if (!integrationStatusesResult.ok) return setFetchState({ status: "error", error: integrationStatusesResult.error.message });
      if (!brightspaceFeedResult.ok) return setFetchState({ status: "error", error: brightspaceFeedResult.error.message });
      if (!monthlySpendResult.ok) return setFetchState({ status: "error", error: monthlySpendResult.error.message });

      setFetchState({
        status: "ready",
        data: {
          userId,
          profile: profileResult.data,
          killHabits: killHabitsResult.data,
          integrationStatuses: integrationStatusesResult.data,
          brightspaceFeed: brightspaceFeedResult.data,
          monthlySpend: monthlySpendResult.data,
          hasEverCalledModel: modelUsageRow.data != null,
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
