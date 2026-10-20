import { describe, expect, it } from "vitest";
import type {
  CalendarDate,
  DependencyMode,
  TaskId,
  TaskStatus,
} from "../task/task";
import {
  type ShiftItem,
  type ShiftTask,
  shiftLaterPlanner,
} from "./shift-later";
import { buildTaskRelations } from "./task-relations";

function day(month: number, date: number): CalendarDate {
  return { year: 2026, month, day: date };
}

function task(
  id: TaskId,
  setup: {
    status?: TaskStatus;
    start?: CalendarDate;
    due?: CalendarDate;
    dependencies?: TaskId[];
    dependencyMode?: DependencyMode;
    dependencyDelay?: number;
  } = {},
): ShiftItem["task"] {
  return {
    id,
    status: setup.status ?? "todo",
    start: setup.start ?? null,
    due: setup.due ?? null,
    sequential: false,
    dependencies: setup.dependencies ?? [],
    dependencyMode: setup.dependencyMode ?? "all",
    dependencyDelay: setup.dependencyDelay ?? 0,
  };
}

/** The task relations among `tasks`, top-level tasks in the order given. */
function related(tasks: ShiftItem["task"][]) {
  return buildTaskRelations(
    tasks.map((task, position) => ({ task, parentId: null, position })),
  );
}

/** The plan from `from` among `tasks`, every task not done movable. */
function plan(tasks: ShiftItem["task"][], from: TaskId) {
  return shiftLaterPlanner(
    related(tasks),
    (item: ShiftTask) => item.status !== "done",
  )(from);
}

describe("shiftLaterPlanner", () => {
  it("moves a task in conflict to its dependency's due date, keeping the days between its start and due dates", () => {
    const tasks = [
      task(1, { start: day(10, 1), due: day(10, 12) }),
      task(2, { start: day(10, 8), due: day(10, 10), dependencies: [1] }),
    ];

    expect(plan(tasks, 1)).toEqual([
      { id: 2, start: day(10, 12), due: day(10, 14) },
    ]);
  });

  it("moves its start to the dependency's due date plus the dependency delay", () => {
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, {
        start: day(10, 13),
        due: day(10, 16),
        dependencies: [1],
        dependencyDelay: 2,
      }),
    ];

    expect(plan(tasks, 1)).toEqual([
      { id: 2, start: day(10, 14), due: day(10, 17) },
    ]);
  });

  it("moves only the start of a task with no due date", () => {
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, { start: day(10, 8), dependencies: [1] }),
    ];

    expect(plan(tasks, 1)).toEqual([{ id: 2, start: day(10, 12), due: null }]);
  });

  it("goes on along the chain: a task waiting for a moved one is judged by its new due date", () => {
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, { start: day(10, 8), due: day(10, 10), dependencies: [1] }),
      // Not in conflict before 2 moves: 2 is due 10-10.
      task(3, { start: day(10, 11), due: day(10, 11), dependencies: [2] }),
    ];

    expect(plan(tasks, 1)).toEqual([
      { id: 2, start: day(10, 12), due: day(10, 14) },
      { id: 3, start: day(10, 14), due: day(10, 14) },
    ]);
  });

  it("takes the latest date for a task reached along several paths, judged once", () => {
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, { start: day(10, 10), due: day(10, 20), dependencies: [1] }),
      task(3, { start: day(10, 10), due: day(10, 11), dependencies: [1] }),
      task(4, { start: day(10, 14), due: day(10, 15), dependencies: [2, 3] }),
    ];

    // 2 and 3 in either order; 4 after both.
    const shifted = plan(tasks, 1);
    expect(shifted.at(-1)?.id).toBe(4);
    expect([...shifted].sort((a, b) => a.id - b.id)).toEqual([
      { id: 2, start: day(10, 12), due: day(10, 22) },
      { id: 3, start: day(10, 12), due: day(10, 13) },
      { id: 4, start: day(10, 22), due: day(10, 23) },
    ]);
  });

  it("judges a task waiting for a moved one and one left in place by both, so it moves to the later", () => {
    // 3 waits for 2 (moved) and for 4 (never reached, due 10-20).
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, { start: day(10, 8), due: day(10, 10), dependencies: [1] }),
      task(4, { due: day(10, 20) }),
      task(3, { start: day(10, 11), due: day(10, 12), dependencies: [2, 4] }),
    ];

    expect(plan(tasks, 1)).toEqual([
      { id: 2, start: day(10, 12), due: day(10, 14) },
      { id: 3, start: day(10, 20), due: day(10, 21) },
    ]);
  });

  it("moves neither done tasks nor ones not movable", () => {
    const tasks = [
      task(1, { due: day(10, 12) }),
      task(2, {
        status: "done",
        start: day(10, 8),
        due: day(10, 9),
        dependencies: [1],
      }),
      task(3, { start: day(10, 8), dependencies: [1] }),
    ];

    expect(
      shiftLaterPlanner(
        related(tasks),
        (item) => item.status !== "done" && item.id !== 3,
      )(1),
    ).toEqual([]);
  });

  it("ends on a dependency cycle, each task shifted once and the task shifted from never", () => {
    const tasks = [
      task(1, { start: day(10, 1), due: day(10, 12), dependencies: [3] }),
      task(2, { start: day(10, 8), due: day(10, 10), dependencies: [1, 3] }),
      task(3, { start: day(10, 9), due: day(10, 9), dependencies: [2] }),
    ];

    expect(plan(tasks, 1)).toEqual([
      { id: 2, start: day(10, 12), due: day(10, 14) },
      { id: 3, start: day(10, 14), due: day(10, 14) },
    ]);
  });

  it("stops at a task not in conflict: a conflict already further down the chain stays where it is", () => {
    // 1 → 2 → 3: 2 starts after 1 is due; 3 already starts before 2 is due.
    const tasks = [
      task(1, { start: day(10, 1), due: day(10, 5) }),
      task(2, { start: day(10, 6), due: day(10, 10), dependencies: [1] }),
      task(3, { start: day(10, 8), due: day(10, 9), dependencies: [2] }),
    ];

    expect(plan(tasks, 1)).toEqual([]);
  });
});
