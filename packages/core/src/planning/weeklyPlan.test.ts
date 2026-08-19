import { describe, expect, it } from 'vitest';
import { buildWeeklyPlan, type BuildWeeklyPlanInput, type WeeklyDeliverableInput } from './weeklyPlan';

const TODAY = '2026-08-24'; // Monday
const WEEK_END = '2026-08-30'; // Sunday

function day(date: string, startHour: number, endHour: number) {
  return { date, freeIntervals: [{ start: `${date}T${String(startHour).padStart(2, '0')}:00:00.000Z`, end: `${date}T${String(endHour).padStart(2, '0')}:00:00.000Z` }] };
}

function deliverable(overrides: Partial<WeeklyDeliverableInput> & Pick<WeeklyDeliverableInput, 'deliverableId' | 'courseId'>): WeeklyDeliverableInput {
  return {
    dueDate: WEEK_END,
    remainingMinutes: 60,
    riskScore: 50,
    riskReductionPerMinute: 1,
    ...overrides,
  };
}

describe('buildWeeklyPlan', () => {
  it('a single deliverable with plenty of capacity is fully placed into the earliest available time', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [deliverable({ deliverableId: 1, courseId: 10, remainingMinutes: 90 })],
      days: [day(TODAY, 16, 20)],
    };
    const result = buildWeeklyPlan(input);
    expect(result.blocks).toEqual([{ deliverableId: 1, courseId: 10, date: TODAY, startAt: `${TODAY}T16:00:00.000Z`, endAt: `${TODAY}T17:30:00.000Z`, minutes: 90 }]);
    expect(result.unplaced).toEqual([]);
    expect(result.hasUnplacedWork).toBe(false);
  });

  it('higher risk-reduction-per-minute wins the earliest slot, even with a lower raw risk score', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [
        deliverable({ deliverableId: 1, courseId: 10, riskScore: 90, riskReductionPerMinute: 0.5, remainingMinutes: 60 }),
        deliverable({ deliverableId: 2, courseId: 20, riskScore: 40, riskReductionPerMinute: 2.0, remainingMinutes: 60 }),
      ],
      days: [day(TODAY, 16, 18)], // exactly 120 minutes -- both fit, but order matters for WHICH slot each gets
    };
    const result = buildWeeklyPlan(input);
    expect(result.blocks[0]!.deliverableId).toBe(2); // higher riskReductionPerMinute placed first
    expect(result.blocks[0]!.startAt).toBe(`${TODAY}T16:00:00.000Z`);
    expect(result.blocks[1]!.deliverableId).toBe(1);
    expect(result.blocks[1]!.startAt).toBe(`${TODAY}T17:00:00.000Z`);
  });

  it('an oversubscribed week places the highest-priority deliverable in full and reports the rest as unplaced with an accurate shortfall', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [
        deliverable({ deliverableId: 1, courseId: 10, riskReductionPerMinute: 3, remainingMinutes: 100 }),
        deliverable({ deliverableId: 2, courseId: 20, riskReductionPerMinute: 1, remainingMinutes: 80 }),
      ],
      days: [day(TODAY, 16, 17, )], // only 60 minutes total capacity
    };
    const result = buildWeeklyPlan(input);
    // deliverable 1 (higher priority) gets the entire 60 minutes available
    expect(result.blocks).toEqual([{ deliverableId: 1, courseId: 10, date: TODAY, startAt: `${TODAY}T16:00:00.000Z`, endAt: `${TODAY}T17:00:00.000Z`, minutes: 60 }]);
    // deliverable 1 is STILL short 40 minutes -- also reported as unplaced, not silently truncated
    expect(result.unplaced).toContainEqual({ deliverableId: 1, courseId: 10, minutesNeeded: 100, minutesPlaced: 60, minutesShortfall: 40, reason: 'insufficient_capacity' });
    // deliverable 2 gets nothing at all -- zero placed, full shortfall, still reported (not silently dropped)
    expect(result.unplaced).toContainEqual({ deliverableId: 2, courseId: 20, minutesNeeded: 80, minutesPlaced: 0, minutesShortfall: 80, reason: 'insufficient_capacity' });
    expect(result.hasUnplacedWork).toBe(true);
  });

  it('a deliverable due before the planning window starts is reported unplaced with reason due_before_window, never silently skipped', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [deliverable({ deliverableId: 1, courseId: 10, dueDate: '2026-08-20', remainingMinutes: 30 })], // due before today
      days: [day(TODAY, 16, 20)],
    };
    const result = buildWeeklyPlan(input);
    expect(result.blocks).toEqual([]);
    expect(result.unplaced).toEqual([{ deliverableId: 1, courseId: 10, minutesNeeded: 30, minutesPlaced: 0, minutesShortfall: 30, reason: 'due_before_window' }]);
  });

  it("a deliverable is never scheduled past its own due date, even when later-week capacity is free", () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [deliverable({ deliverableId: 1, courseId: 10, dueDate: TODAY, remainingMinutes: 30 })], // due today only
      days: [day(TODAY, 16, 17), day('2026-08-25', 16, 20)], // Tuesday has plenty of room, but is past the due date
    };
    const result = buildWeeklyPlan(input);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.date).toBe(TODAY);
  });

  it('the exact same input always produces the exact same plan (determinism)', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [
        deliverable({ deliverableId: 3, courseId: 30, riskReductionPerMinute: 1, remainingMinutes: 45 }),
        deliverable({ deliverableId: 1, courseId: 10, riskReductionPerMinute: 1, remainingMinutes: 45 }), // identical ranking key to #3
        deliverable({ deliverableId: 2, courseId: 20, riskReductionPerMinute: 2, remainingMinutes: 30 }),
      ],
      days: [day(TODAY, 16, 20)],
    };
    const first = buildWeeklyPlan(input);
    const second = buildWeeklyPlan(input);
    expect(first).toEqual(second);
    // Tie between deliverable 1 and 3 (identical riskReductionPerMinute and riskScore and
    // dueDate) is broken by deliverableId ascending -- 1 before 3.
    const order = first.blocks.map((b) => b.deliverableId);
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(3));
  });

  it('course allocations aggregate correctly across multiple blocks for the same course', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [
        deliverable({ deliverableId: 1, courseId: 10, remainingMinutes: 60, riskReductionPerMinute: 2 }),
        deliverable({ deliverableId: 2, courseId: 10, remainingMinutes: 30, riskReductionPerMinute: 1 }), // same course, different deliverable
      ],
      days: [day(TODAY, 16, 20)],
    };
    const result = buildWeeklyPlan(input);
    expect(result.courseAllocations).toEqual([{ courseId: 10, minutesAllocated: 90 }]);
  });

  it('academic load is "low" when needed minutes are well under capacity', () => {
    const result = buildWeeklyPlan({ today: TODAY, weekEnd: WEEK_END, deliverables: [deliverable({ deliverableId: 1, courseId: 10, remainingMinutes: 60 })], days: [day(TODAY, 8, 20)] });
    expect(result.academicLoad).toBe('low');
  });

  it('academic load is "critical" when needed minutes exceed total capacity', () => {
    const result = buildWeeklyPlan({ today: TODAY, weekEnd: WEEK_END, deliverables: [deliverable({ deliverableId: 1, courseId: 10, remainingMinutes: 600 })], days: [day(TODAY, 16, 17)] });
    expect(result.academicLoad).toBe('critical');
  });

  it('a week with zero deliverables produces an empty, valid plan -- not an error', () => {
    const result = buildWeeklyPlan({ today: TODAY, weekEnd: WEEK_END, deliverables: [], days: [day(TODAY, 16, 20)] });
    expect(result.blocks).toEqual([]);
    expect(result.unplaced).toEqual([]);
    expect(result.academicLoad).toBe('low');
    expect(result.totalNeededMinutes).toBe(0);
  });

  it('a week with zero free capacity anywhere places nothing and reports every deliverable as unplaced', () => {
    const result = buildWeeklyPlan({ today: TODAY, weekEnd: WEEK_END, deliverables: [deliverable({ deliverableId: 1, courseId: 10, remainingMinutes: 60 })], days: [{ date: TODAY, freeIntervals: [] }] });
    expect(result.blocks).toEqual([]);
    expect(result.unplaced).toEqual([{ deliverableId: 1, courseId: 10, minutesNeeded: 60, minutesPlaced: 0, minutesShortfall: 60, reason: 'insufficient_capacity' }]);
    expect(result.academicLoad).toBe('critical');
  });

  it('a lower-priority deliverable receives whatever fragment of an interval a higher-priority one left behind', () => {
    const input: BuildWeeklyPlanInput = {
      today: TODAY,
      weekEnd: WEEK_END,
      deliverables: [
        deliverable({ deliverableId: 1, courseId: 10, riskReductionPerMinute: 2, remainingMinutes: 40 }),
        deliverable({ deliverableId: 2, courseId: 20, riskReductionPerMinute: 1, remainingMinutes: 20 }),
      ],
      days: [day(TODAY, 16, 17)], // 60-minute single interval
    };
    const result = buildWeeklyPlan(input);
    expect(result.blocks).toEqual([
      { deliverableId: 1, courseId: 10, date: TODAY, startAt: `${TODAY}T16:00:00.000Z`, endAt: `${TODAY}T16:40:00.000Z`, minutes: 40 },
      { deliverableId: 2, courseId: 20, date: TODAY, startAt: `${TODAY}T16:40:00.000Z`, endAt: `${TODAY}T17:00:00.000Z`, minutes: 20 },
    ]);
    expect(result.unplaced).toEqual([]);
  });
});
