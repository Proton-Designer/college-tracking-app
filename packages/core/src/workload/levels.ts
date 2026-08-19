export type WorkloadItemKind = 'hardDeadline' | 'attendance' | 'discretionary';

export interface WorkloadItem {
  id: string;
  kind: WorkloadItemKind;
  /** Calibrated minutes (see §3). */
  estimatedMinutes: number;
  /** Expected risk-score reduction if completed. Required for discretionary items. */
  riskReduction?: number;
}

export interface WorkloadLevels {
  floorItems: WorkloadItem[];
  floorMinutes: number;
  floorExceedsCapacity: boolean;
  capacityMinutes: number;
  /** Floor + selected discretionary items, filled by risk-reduction-per-minute. */
  targetItems: WorkloadItem[];
  targetMinutes: number;
  /** Discretionary items beyond target capacity — explicitly optional. */
  stretchItems: WorkloadItem[];
}

/**
 * Floor / Target / Stretch — DOMAIN_ENGINE_SPEC.md §7. Discretionary items are selected
 * by risk reduction per calibrated minute (a greedy knapsack on marginal value), not by
 * raw risk — this is what makes the allocation "academic return on time".
 */
export function computeWorkloadLevels(items: WorkloadItem[], capacityMinutes: number): WorkloadLevels {
  const floorItems = items.filter((i) => i.kind === 'hardDeadline' || i.kind === 'attendance');
  const floorMinutes = floorItems.reduce((sum, i) => sum + i.estimatedMinutes, 0);
  const floorExceedsCapacity = floorMinutes > capacityMinutes;

  const discretionary = items.filter((i) => i.kind === 'discretionary');
  const rankedByValuePerMinute = [...discretionary].sort((a, b) => {
    const aRatio = (a.riskReduction ?? 0) / Math.max(a.estimatedMinutes, 1e-9);
    const bRatio = (b.riskReduction ?? 0) / Math.max(b.estimatedMinutes, 1e-9);
    return bRatio - aRatio;
  });

  let remainingCapacity = Math.max(capacityMinutes - floorMinutes, 0);
  const targetDiscretionary: WorkloadItem[] = [];
  const stretchItems: WorkloadItem[] = [];
  for (const item of rankedByValuePerMinute) {
    if (item.estimatedMinutes <= remainingCapacity) {
      targetDiscretionary.push(item);
      remainingCapacity -= item.estimatedMinutes;
    } else {
      stretchItems.push(item);
    }
  }

  const targetItems = [...floorItems, ...targetDiscretionary];
  const targetMinutes = targetItems.reduce((sum, i) => sum + i.estimatedMinutes, 0);

  return {
    floorItems,
    floorMinutes,
    floorExceedsCapacity,
    capacityMinutes,
    targetItems,
    targetMinutes,
    stretchItems,
  };
}
