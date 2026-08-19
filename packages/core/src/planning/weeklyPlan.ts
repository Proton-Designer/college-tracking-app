import type { LocalDate } from '../types';
import { compareLocalDate } from '../util/date';
import type { TimeInterval } from './freeIntervals';
import { intervalMinutes } from './freeIntervals';

/**
 * Weekly deep-work allocation -- the brief's Sunday planning session. Greedy priority
 * walk across deliverables, structurally mirroring buildBackplan.ts's single-deliverable
 * backward walk, generalized to multiple deliverables sharing one week's capacity pool.
 *
 * Ranking deliberately reuses the SAME rule packages/api's rankSuggestedMits already
 * applies to Today's MITs -- risk reduction per minute, not raw risk score -- so Today
 * and the weekly plan never disagree about what "priority" means. The caller (packages/
 * api) is responsible for computing riskReductionPerMinute the identical way
 * marginalRiskReduction does; this function only consumes it.
 *
 * Unplaced work is a first-class output, never a silent omission -- same principle as
 * buildBackplan's `infeasible`/`shortfallMinutes` and Recovery Mode's "rolled forward"
 * disclosure. A plan that looks complete but quietly dropped the thing due soonest is the
 * worst possible failure mode for a planning feature.
 */

export interface WeeklyDeliverableInput {
  deliverableId: number;
  courseId: number;
  dueDate: LocalDate;
  /** Effort still needed, already net of what's completed/planned elsewhere. */
  remainingMinutes: number;
  riskScore: number;
  /** The SAME ranking key rankSuggestedMits uses for Today's MITs -- marginal risk
   *  reduction per calibrated minute, not raw risk score. */
  riskReductionPerMinute: number;
}

export interface DayPlanningInput {
  date: LocalDate;
  /** Already net of calendar events AND already-timeboxed tasks -- the caller builds
   *  this from both sources merged, this function has no calendar/task awareness. */
  freeIntervals: TimeInterval[];
}

export interface WeeklyPlanBlock {
  deliverableId: number;
  courseId: number;
  date: LocalDate;
  startAt: string;
  endAt: string;
  minutes: number;
}

export type UnplacedReason = 'due_before_window' | 'insufficient_capacity';

export interface UnplacedDeliverable {
  deliverableId: number;
  courseId: number;
  minutesNeeded: number;
  minutesPlaced: number;
  minutesShortfall: number;
  reason: UnplacedReason;
}

export interface CourseAllocation {
  courseId: number;
  minutesAllocated: number;
}

export type AcademicLoadBand = 'low' | 'moderate' | 'high' | 'critical';

export interface WeeklyPlanResult {
  blocks: WeeklyPlanBlock[];
  courseAllocations: CourseAllocation[];
  unplaced: UnplacedDeliverable[];
  hasUnplacedWork: boolean;
  academicLoad: AcademicLoadBand;
  totalNeededMinutes: number;
  totalCapacityMinutes: number;
}

export interface BuildWeeklyPlanInput {
  today: LocalDate;
  /** Last date the plan covers, inclusive. */
  weekEnd: LocalDate;
  deliverables: WeeklyDeliverableInput[];
  /** One entry per date in [today, weekEnd] the caller has real free-interval data for. A
   *  date with no entry is treated as zero capacity, not "unknown" -- the caller must
   *  supply every day it wants considered. */
  days: DayPlanningInput[];
}

const LOAD_THRESHOLDS: Array<[number, AcademicLoadBand]> = [
  [0.5, 'low'],
  [0.8, 'moderate'],
  [1.0, 'high'],
];

/** Ratio of needed-to-available minutes across the whole week, not a per-course score --
 *  deliberately coarser than assignment/course risk banding, since this answers "should
 *  I brace for a hard week," not "which item." */
function academicLoadForRatio(ratio: number): AcademicLoadBand {
  for (const [threshold, band] of LOAD_THRESHOLDS) {
    if (ratio < threshold) return band;
  }
  return 'critical';
}

/** A mutable per-day queue of free intervals, consumed chronologically as deliverables
 *  are placed -- later (lower-priority) deliverables see only what earlier ones left. */
type MutableDayIntervals = Map<LocalDate, TimeInterval[]>;

function cloneDayIntervals(days: DayPlanningInput[]): MutableDayIntervals {
  const map: MutableDayIntervals = new Map();
  for (const day of days) {
    map.set(
      day.date,
      [...day.freeIntervals]
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((interval) => ({ ...interval })),
    );
  }
  return map;
}

function eligibleDatesAscending(today: LocalDate, weekEnd: LocalDate, dueDate: LocalDate, allDates: LocalDate[]): LocalDate[] {
  const windowEnd = compareLocalDate(dueDate, weekEnd) < 0 ? dueDate : weekEnd;
  if (compareLocalDate(windowEnd, today) < 0) return []; // due before the window even starts
  return allDates.filter((d) => compareLocalDate(d, today) >= 0 && compareLocalDate(d, windowEnd) <= 0);
}

/** Deterministic priority order -- same inputs must always produce the same plan.
 *  riskReductionPerMinute desc (the ranking rule itself) -> riskScore desc (a tiebreak
 *  that still favors real urgency) -> dueDate asc (soonest-due wins remaining ties) ->
 *  deliverableId asc (the final, arbitrary-but-stable tiebreak). */
function sortByPriority(deliverables: WeeklyDeliverableInput[]): WeeklyDeliverableInput[] {
  return [...deliverables].sort((a, b) => {
    if (b.riskReductionPerMinute !== a.riskReductionPerMinute) return b.riskReductionPerMinute - a.riskReductionPerMinute;
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    const dueDiff = compareLocalDate(a.dueDate, b.dueDate);
    if (dueDiff !== 0) return dueDiff;
    return a.deliverableId - b.deliverableId;
  });
}

export function buildWeeklyPlan(input: BuildWeeklyPlanInput): WeeklyPlanResult {
  const allDates = input.days.map((d) => d.date).sort(compareLocalDate);
  const dayIntervals = cloneDayIntervals(input.days);

  const totalCapacityMinutes = input.days.reduce(
    (sum, day) => sum + day.freeIntervals.reduce((s, iv) => s + intervalMinutes(iv), 0),
    0,
  );
  const totalNeededMinutes = input.deliverables.reduce((sum, d) => sum + d.remainingMinutes, 0);

  const ordered = sortByPriority(input.deliverables);
  const blocks: WeeklyPlanBlock[] = [];
  const unplaced: UnplacedDeliverable[] = [];

  for (const deliverable of ordered) {
    const eligibleDates = eligibleDatesAscending(input.today, input.weekEnd, deliverable.dueDate, allDates);
    if (eligibleDates.length === 0) {
      unplaced.push({
        deliverableId: deliverable.deliverableId,
        courseId: deliverable.courseId,
        minutesNeeded: deliverable.remainingMinutes,
        minutesPlaced: 0,
        minutesShortfall: deliverable.remainingMinutes,
        reason: 'due_before_window',
      });
      continue;
    }

    let remaining = deliverable.remainingMinutes;

    for (const date of eligibleDates) {
      if (remaining <= 0) break;
      const intervals = dayIntervals.get(date);
      if (!intervals) continue;

      const nextIntervals: TimeInterval[] = [];
      for (const interval of intervals) {
        if (remaining <= 0) {
          nextIntervals.push(interval);
          continue;
        }
        const available = intervalMinutes(interval);
        if (available <= 0) continue;

        const take = Math.min(available, remaining);
        const startMs = new Date(interval.start).getTime();
        const blockEndMs = startMs + take * 60_000;

        blocks.push({
          deliverableId: deliverable.deliverableId,
          courseId: deliverable.courseId,
          date,
          startAt: interval.start,
          endAt: new Date(blockEndMs).toISOString(),
          minutes: take,
        });
        remaining -= take;

        // Leave whatever's left of this interval available for the next deliverable.
        if (take < available) {
          nextIntervals.push({ start: new Date(blockEndMs).toISOString(), end: interval.end });
        }
      }
      dayIntervals.set(date, nextIntervals);
    }

    const minutesPlaced = deliverable.remainingMinutes - remaining;
    if (remaining > 0) {
      unplaced.push({
        deliverableId: deliverable.deliverableId,
        courseId: deliverable.courseId,
        minutesNeeded: deliverable.remainingMinutes,
        minutesPlaced,
        minutesShortfall: remaining,
        reason: 'insufficient_capacity',
      });
    }
  }

  const courseMinutes = new Map<number, number>();
  for (const block of blocks) {
    courseMinutes.set(block.courseId, (courseMinutes.get(block.courseId) ?? 0) + block.minutes);
  }
  const courseAllocations: CourseAllocation[] = Array.from(courseMinutes.entries())
    .map(([courseId, minutesAllocated]) => ({ courseId, minutesAllocated }))
    .sort((a, b) => b.minutesAllocated - a.minutesAllocated);

  const ratio = totalCapacityMinutes > 0 ? totalNeededMinutes / totalCapacityMinutes : totalNeededMinutes > 0 ? Infinity : 0;

  return {
    blocks: blocks.sort((a, b) => a.startAt.localeCompare(b.startAt)),
    courseAllocations,
    unplaced,
    hasUnplacedWork: unplaced.length > 0,
    academicLoad: academicLoadForRatio(ratio),
    totalNeededMinutes,
    totalCapacityMinutes,
  };
}
