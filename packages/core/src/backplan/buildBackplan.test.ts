import { describe, expect, it } from 'vitest';
import { buildBackplan, type DayCapacity } from './buildBackplan.js';
import { PHASE_TEMPLATES } from './phaseTemplates.js';

function capacityRange(fromDate: string, count: number, minutesPerDay: number): DayCapacity[] {
  return Array.from({ length: count }, (_, i) => ({
    date: shiftDate(fromDate, i),
    availableMinutes: minutesPerDay,
  }));
}

function shiftDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

describe('buildBackplan — ample capacity', () => {
  it('spreads phase minutes across the window without compression', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-11', // 10 days out, buffer 1 -> target completion 08-10
      totalEffortMinutes: 600,
      type: 'paper',
      capacity: capacityRange('2026-08-01', 11, 120), // 120min/day * 10 days = 1200 >> 600
    });
    expect(plan.compressed).toBe(false);
    expect(plan.overdue).toBe(false);
    const sum = plan.milestones.reduce((s, m) => s + m.minutes, 0);
    expect(sum).toBeCloseTo(600, 4);
  });

  it('never schedules a milestone before today or on the due date itself past the buffer', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-11',
      totalEffortMinutes: 600,
      type: 'paper',
      capacity: capacityRange('2026-08-01', 11, 120),
    });
    for (const m of plan.milestones) {
      expect(m.date >= '2026-08-01').toBe(true);
      expect(m.date <= '2026-08-10').toBe(true); // target completion = due - buffer(1)
    }
  });

  it('never reorders phases: each phase\'s milestones land no later than the next phase\'s', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-11',
      totalEffortMinutes: 600,
      type: 'paper',
      capacity: capacityRange('2026-08-01', 11, 120),
    });
    const phaseOrder = PHASE_TEMPLATES.paper.map((p) => p.name);
    const lastDateForPhase = (name: string) =>
      plan.milestones.filter((m) => m.phase === name).map((m) => m.date).sort().at(-1);
    const firstDateForPhase = (name: string) =>
      plan.milestones.filter((m) => m.phase === name).map((m) => m.date).sort()[0];
    for (let i = 0; i < phaseOrder.length - 1; i++) {
      const currentLast = lastDateForPhase(phaseOrder[i]!);
      const nextFirst = firstDateForPhase(phaseOrder[i + 1]!);
      if (currentLast && nextFirst) {
        expect(currentLast <= nextFirst).toBe(true);
      }
    }
  });
});

describe('buildBackplan — exactly enough capacity', () => {
  it('is not compressed when capacity exactly equals total effort', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-04', // target completion 08-03, window 08-01..08-03 (3 days)
      totalEffortMinutes: 300,
      type: 'reading',
      capacity: capacityRange('2026-08-01', 3, 100), // exactly 300
    });
    expect(plan.compressed).toBe(false);
    const sum = plan.milestones.reduce((s, m) => s + m.minutes, 0);
    expect(sum).toBeCloseTo(300, 4);
  });
});

describe('buildBackplan — insufficient capacity', () => {
  it('sets compressed=true with the correct shortfall and lists dropped phases', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-04', // target completion 08-03, window = 3 days
      totalEffortMinutes: 600,
      type: 'reading', // survey .15, read .60, notes .25
      capacity: capacityRange('2026-08-01', 3, 100), // 300 total, half of what's needed
    });
    expect(plan.compressed).toBe(true);
    expect(plan.shortfallMinutes).toBeCloseTo(300, 4);
    // "read" (fraction .60 = 360min) alone exceeds the 300min budget, so even it gets dropped;
    // the crash plan greedily keeps the highest-fraction phases that fit.
    expect(plan.droppedPhases.length).toBeGreaterThan(0);
    const sum = plan.milestones.reduce((s, m) => s + m.minutes, 0);
    expect(sum).toBeLessThanOrEqual(300);
  });
});

describe('buildBackplan — crash plan never drops the required (submission) phase', () => {
  it('keeps "final" even when its fraction would lose a pure fraction-greedy selection', () => {
    // paper: understand .10(60) sources .20(120) outline .10(60) draft .30(180) revise .20(120) final .10(60), total=600
    // budget=200: a fraction-greedy with no reservation would pick draft(180) and drop final(60).
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-03', // target completion 08-02, window = 2 days
      totalEffortMinutes: 600,
      type: 'paper',
      capacity: capacityRange('2026-08-01', 2, 100), // 200 total
    });
    expect(plan.compressed).toBe(true);
    expect(plan.droppedPhases).not.toContain('final');
    expect(plan.milestones.some((m) => m.phase === 'final')).toBe(true);
    expect(plan.infeasible).toBe(false);
  });

  it('marks the plan infeasible when capacity cannot even cover the required phase', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-02',
      totalEffortMinutes: 600, // final alone needs 60min
      type: 'paper',
      capacity: [{ date: '2026-08-01', availableMinutes: 30 }], // < final's 60min
    });
    expect(plan.compressed).toBe(true);
    expect(plan.infeasible).toBe(true);
    // still schedules as much of the required phase as fits
    expect(plan.milestones.every((m) => m.phase === 'final')).toBe(true);
    expect(plan.droppedPhases).not.toContain('final');
  });

  it('is never infeasible for a template with no required phase (exam)', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-02',
      totalEffortMinutes: 600,
      type: 'exam',
      capacity: [{ date: '2026-08-01', availableMinutes: 10 }],
    });
    expect(plan.compressed).toBe(true);
    expect(plan.infeasible).toBe(false);
  });
});

describe('buildBackplan — due tomorrow', () => {
  it('confines the whole plan to a single-day window', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-02',
      totalEffortMinutes: 60,
      type: 'problem_set',
      capacity: [{ date: '2026-08-01', availableMinutes: 120 }],
    });
    expect(plan.overdue).toBe(false);
    expect(plan.milestones.every((m) => m.date === '2026-08-01')).toBe(true);
  });
});

describe('buildBackplan — due today', () => {
  it('clamps the target completion date to today', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-01',
      totalEffortMinutes: 30,
      type: 'problem_set',
      capacity: [{ date: '2026-08-01', availableMinutes: 120 }],
    });
    expect(plan.overdue).toBe(false);
    expect(plan.targetCompletionDate).toBe('2026-08-01');
    expect(plan.milestones.every((m) => m.date === '2026-08-01')).toBe(true);
  });
});

describe('buildBackplan — already overdue', () => {
  it('produces a single submit-now milestone', () => {
    const plan = buildBackplan({
      today: '2026-08-05',
      dueDate: '2026-08-01',
      totalEffortMinutes: 120,
      type: 'paper',
      capacity: [],
    });
    expect(plan.overdue).toBe(true);
    expect(plan.milestones).toHaveLength(1);
    expect(plan.milestones[0]!.date).toBe('2026-08-05');
  });
});

describe('buildBackplan — zero-capacity day is skipped', () => {
  it('places no milestone on a zero-capacity weekend day', () => {
    const plan = buildBackplan({
      today: '2026-08-01',
      dueDate: '2026-08-05', // target completion 08-04, window 08-01..08-04
      totalEffortMinutes: 200,
      type: 'reading',
      capacity: [
        { date: '2026-08-01', availableMinutes: 100 },
        { date: '2026-08-02', availableMinutes: 0 }, // weekend
        { date: '2026-08-03', availableMinutes: 0 }, // weekend
        { date: '2026-08-04', availableMinutes: 100 },
      ],
    });
    expect(plan.milestones.some((m) => m.date === '2026-08-02')).toBe(false);
    expect(plan.milestones.some((m) => m.date === '2026-08-03')).toBe(false);
    expect(plan.compressed).toBe(false);
  });
});
