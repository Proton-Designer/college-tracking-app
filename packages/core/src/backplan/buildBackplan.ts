import type { LocalDate } from '../types';
import { addDays, compareLocalDate, daysBetween } from '../util/date';
import { PHASE_TEMPLATES, type DeliverableType } from './phaseTemplates';

const DEFAULT_BUFFER_DAYS = 1;
const OVERDUE_PHASE_NAME = 'submit now / assess damage';

export interface DayCapacity {
  date: LocalDate;
  availableMinutes: number;
}

export interface BuildBackplanInput {
  today: LocalDate;
  dueDate: LocalDate;
  /** Already-calibrated total effort in minutes (see §3 calibration). */
  totalEffortMinutes: number;
  type: DeliverableType;
  /** Days before the due date to target completion. Default 1. */
  bufferDays?: number;
  capacity: DayCapacity[];
}

export interface Milestone {
  date: LocalDate;
  phase: string;
  minutes: number;
}

export interface Backplan {
  milestones: Milestone[];
  compressed: boolean;
  shortfallMinutes: number;
  overdue: boolean;
  /** Phases dropped entirely by the crash plan when capacity was insufficient. */
  droppedPhases: string[];
  /** True when capacity can't even cover the template's required (submission) phase. */
  infeasible: boolean;
  totalEffortMinutes: number;
  targetCompletionDate: LocalDate;
}

function enumerateDatesAscending(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = daysBetween(from, to);
  return Array.from({ length: span + 1 }, (_, i) => addDays(from, i));
}

/**
 * Backward-planned milestone chain — DOMAIN_ENGINE_SPEC.md §4. Walks backward from the
 * target completion date, consuming daily capacity in reverse phase order so phase
 * ordering is preserved by construction (a phase is never revisited once exhausted).
 */
export function buildBackplan(input: BuildBackplanInput): Backplan {
  const { today, dueDate, totalEffortMinutes, type } = input;
  const bufferDays = input.bufferDays ?? DEFAULT_BUFFER_DAYS;

  if (compareLocalDate(dueDate, today) < 0) {
    return {
      milestones: [{ date: today, phase: OVERDUE_PHASE_NAME, minutes: totalEffortMinutes }],
      compressed: true,
      shortfallMinutes: totalEffortMinutes,
      overdue: true,
      droppedPhases: [],
      infeasible: true,
      totalEffortMinutes,
      targetCompletionDate: dueDate,
    };
  }

  let targetCompletion = addDays(dueDate, -bufferDays);
  if (compareLocalDate(targetCompletion, today) < 0) {
    targetCompletion = today;
  }

  const windowDates = enumerateDatesAscending(today, targetCompletion);
  const capacityByDate = new Map(input.capacity.map((c) => [c.date, c.availableMinutes]));
  const totalCapacity = windowDates.reduce(
    (sum, date) => sum + Math.max(capacityByDate.get(date) ?? 0, 0),
    0,
  );

  const templates = PHASE_TEMPLATES[type];
  const allPhases = templates.map((t) => ({ name: t.name, minutes: t.fraction * totalEffortMinutes }));

  const compressed = totalCapacity < totalEffortMinutes;
  let phasesToSchedule = allPhases;
  let droppedPhases: string[] = [];
  let infeasible = false;

  if (compressed) {
    // The required (submission) phase is reserved first and is never droppable — a crash
    // plan that quietly omits submitting the work is not a legitimate compression.
    const requiredTemplates = templates.filter((t) => t.required);
    const optionalTemplates = templates.filter((t) => !t.required);
    const requiredMinutes = requiredTemplates.reduce((s, t) => s + t.fraction * totalEffortMinutes, 0);

    infeasible = requiredMinutes > totalCapacity;

    const kept = new Set(requiredTemplates.map((t) => t.name));
    const budgetForOptional = Math.max(0, totalCapacity - requiredMinutes);
    const optionalByFractionDesc = [...optionalTemplates].sort((a, b) => b.fraction - a.fraction);
    let runningMinutes = 0;
    for (const t of optionalByFractionDesc) {
      const minutes = t.fraction * totalEffortMinutes;
      if (runningMinutes + minutes <= budgetForOptional) {
        kept.add(t.name);
        runningMinutes += minutes;
      }
    }

    droppedPhases = templates.filter((t) => !kept.has(t.name)).map((t) => t.name);
    phasesToSchedule = allPhases.filter((p) => kept.has(p.name));
  }

  const milestones = walkBackward(windowDates, capacityByDate, phasesToSchedule);
  const shortfallMinutes = compressed ? totalEffortMinutes - totalCapacity : 0;

  return {
    milestones,
    compressed,
    shortfallMinutes,
    overdue: false,
    droppedPhases,
    infeasible,
    totalEffortMinutes,
    targetCompletionDate: targetCompletion,
  };
}

function walkBackward(
  windowDatesAscending: LocalDate[],
  capacityByDate: Map<LocalDate, number>,
  phasesInOrder: Array<{ name: string; minutes: number }>,
): Milestone[] {
  const milestones: Milestone[] = [];
  const daysDescending = [...windowDatesAscending].reverse();
  // Process phases from LAST to FIRST so the latest phase lands closest to the target date.
  const stack = [...phasesInOrder].reverse().map((p) => ({ name: p.name, remaining: p.minutes }));
  let phaseIdx = 0;

  for (const date of daysDescending) {
    let dayCapacity = Math.max(capacityByDate.get(date) ?? 0, 0);
    if (dayCapacity <= 0) continue;

    while (dayCapacity > 0 && phaseIdx < stack.length) {
      const phase = stack[phaseIdx]!;
      if (phase.remaining <= 1e-9) {
        phaseIdx++;
        continue;
      }
      const allocate = Math.min(dayCapacity, phase.remaining);
      milestones.push({ date, phase: phase.name, minutes: allocate });
      dayCapacity -= allocate;
      phase.remaining -= allocate;
    }

    if (phaseIdx >= stack.length) break;
  }

  return milestones.sort((a, b) => compareLocalDate(a.date, b.date));
}
