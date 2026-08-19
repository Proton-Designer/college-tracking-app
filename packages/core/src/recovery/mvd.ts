export type MvdItemKind = 'hardDeadline' | 'attendance' | 'studyBlock' | 'other';

export interface MvdCandidateItem {
  id: string;
  kind: MvdItemKind;
  /** Required for studyBlock items — from §1's risk score, used to pick the highest-value block. */
  riskScore?: number;
}

export interface MvdPlan {
  /** Hard deadlines + attendance obligations + exactly one highest-value study block. */
  kept: MvdCandidateItem[];
  /** Everything rolled forward — explicit so nothing silently disappears. */
  deferred: MvdCandidateItem[];
  sleepByTime: string;
  phoneBlockDuringStudyBlock: true;
}

export interface MvdProtections {
  sleepByTime: string;
}

/**
 * Minimum Viable Day composition — DOMAIN_ENGINE_SPEC.md §6. Hard deadlines and
 * attendance obligations (including exams) are never rolled forward; exactly one study
 * block survives, chosen by risk.
 */
export function composeMinimumViableDay(
  items: MvdCandidateItem[],
  protections: MvdProtections,
): MvdPlan {
  const hardDeadlines = items.filter((i) => i.kind === 'hardDeadline');
  const attendance = items.filter((i) => i.kind === 'attendance');
  const studyBlocks = items.filter((i) => i.kind === 'studyBlock');
  const other = items.filter((i) => i.kind === 'other');

  const bestStudyBlock = studyBlocks.reduce<MvdCandidateItem | null>((best, cur) => {
    if (best === null) return cur;
    return (cur.riskScore ?? -Infinity) > (best.riskScore ?? -Infinity) ? cur : best;
  }, null);

  const kept = [...hardDeadlines, ...attendance, ...(bestStudyBlock ? [bestStudyBlock] : [])];
  const deferredStudyBlocks = studyBlocks.filter((b) => b.id !== bestStudyBlock?.id);
  const deferred = [...other, ...deferredStudyBlocks];

  return {
    kept,
    deferred,
    sleepByTime: protections.sleepByTime,
    phoneBlockDuringStudyBlock: true,
  };
}
