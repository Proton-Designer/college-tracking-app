import { getBackplan, listMilestones, type BackplanMilestoneRow, type DeliverableBackplanRow, type TypedSupabaseClient } from "@collegeos/api";

export interface BackplanChain {
  backplan: DeliverableBackplanRow;
  milestones: BackplanMilestoneRow[];
}

/** One backplan (if any) + its milestones per deliverable id — a deliverable with no
 *  backplan yet just has no entry, not a null placeholder. Kept in sync with
 *  apps/web/src/lib/loadBackplanChains.ts (no `server-only` import here since it also
 *  runs from a client-side RN hook, not a server component). */
export async function loadBackplanChains(
  client: TypedSupabaseClient,
  deliverableIds: number[],
): Promise<Map<number, BackplanChain>> {
  const entries = await Promise.all(
    deliverableIds.map(async (deliverableId) => {
      const backplanResult = await getBackplan(client, deliverableId);
      if (!backplanResult.ok || backplanResult.data == null) return null;
      const backplan = backplanResult.data;

      const milestonesResult = await listMilestones(client, backplan.id);
      const milestones = milestonesResult.ok ? milestonesResult.data : [];

      return [deliverableId, { backplan, milestones }] as const;
    }),
  );

  return new Map(entries.filter((e): e is readonly [number, BackplanChain] => e != null));
}
