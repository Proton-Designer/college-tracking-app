import { describe, expect, it } from 'vitest';
import { derivePlannedMits, type PlannedMitCandidate } from './plannedMits';

function task(overrides: Partial<PlannedMitCandidate> & Pick<PlannedMitCandidate, 'id'>): PlannedMitCandidate {
  return { title: `Task ${overrides.id}`, mitRank: null, status: 'pending', ...overrides };
}

describe('derivePlannedMits', () => {
  it('returns an empty list when nothing has a mitRank — check-in was skipped or nothing was planned', () => {
    expect(derivePlannedMits([])).toEqual([]);
    expect(derivePlannedMits([task({ id: 1, mitRank: null, status: 'pending' })])).toEqual([]);
  });

  it('excludes a task with no mitRank even if it is otherwise a normal open task', () => {
    const tasks = [task({ id: 1, mitRank: null, status: 'in_progress' }), task({ id: 2, mitRank: 1, status: 'pending' })];
    expect(derivePlannedMits(tasks).map((m) => m.taskId)).toEqual([2]);
  });

  it('excludes a cancelled task entirely — not marked complete, not left outstanding', () => {
    const tasks = [task({ id: 1, mitRank: 1, status: 'cancelled' })];
    expect(derivePlannedMits(tasks)).toEqual([]);
  });

  it('a cancelled task never inflates the "N of M done" count by being counted at all', () => {
    const tasks = [
      task({ id: 1, mitRank: 1, status: 'cancelled' }),
      task({ id: 2, mitRank: 2, status: 'completed' }),
    ];
    const result = derivePlannedMits(tasks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ taskId: 2, title: 'Task 2', completed: true });
  });

  it('marks completed:true only for status "completed"', () => {
    const tasks = [task({ id: 1, mitRank: 1, status: 'completed' })];
    expect(derivePlannedMits(tasks)).toEqual([{ taskId: 1, title: 'Task 1', completed: true }]);
  });

  it('marks completed:false for both "pending" and "in_progress" — both are outstanding', () => {
    const tasks = [
      task({ id: 1, mitRank: 1, status: 'pending' }),
      task({ id: 2, mitRank: 2, status: 'in_progress' }),
    ];
    expect(derivePlannedMits(tasks).map((m) => m.completed)).toEqual([false, false]);
  });

  it('sorts by mitRank ascending, independent of input order', () => {
    const tasks = [
      task({ id: 3, mitRank: 3, status: 'pending' }),
      task({ id: 1, mitRank: 1, status: 'pending' }),
      task({ id: 2, mitRank: 2, status: 'pending' }),
    ];
    expect(derivePlannedMits(tasks).map((m) => m.taskId)).toEqual([1, 2, 3]);
  });

  it('a real mixed day: unranked, cancelled, completed and outstanding all present at once', () => {
    const tasks = [
      task({ id: 1, mitRank: null, status: 'pending' }), // never a MIT -- excluded
      task({ id: 2, mitRank: 2, status: 'cancelled' }), // planned then abandoned -- excluded
      task({ id: 3, mitRank: 1, status: 'completed' }), // done
      task({ id: 4, mitRank: 3, status: 'in_progress' }), // still outstanding
    ];
    expect(derivePlannedMits(tasks)).toEqual([
      { taskId: 3, title: 'Task 3', completed: true },
      { taskId: 4, title: 'Task 4', completed: false },
    ]);
  });
});
