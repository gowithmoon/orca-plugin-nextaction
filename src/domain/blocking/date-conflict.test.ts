import { describe, expect, it } from "vitest";
import type {
  CalendarDate,
  DependencyMode,
  TaskId,
  TaskStatus,
} from "../task/task";
import {
  type ConflictDependency,
  type ConflictTask,
  type DependencyLookup,
  dependencyConflicts,
  earliestStart,
  hasDateConflict,
} from "./date-conflict";

function day(month: number, date: number): CalendarDate {
  return { year: 2026, month, day: date };
}

function waiting(setup: {
  start?: CalendarDate;
  dependencies: TaskId[];
  dependencyMode?: DependencyMode;
  dependencyDelay?: number;
}): ConflictTask {
  return {
    start: setup.start ?? null,
    dependencies: setup.dependencies,
    dependencyMode: setup.dependencyMode ?? "all",
    dependencyDelay: setup.dependencyDelay ?? 0,
  };
}

/** The tasks depended on; an ID left out is a stale dependency. */
function lookupOf(
  tasks: Record<TaskId, { status?: TaskStatus; due?: CalendarDate }>,
): DependencyLookup {
  return (id) => {
    const found = tasks[id];
    if (!found) return undefined;
    const dependency: ConflictDependency = {
      status: found.status ?? "todo",
      due: found.due ?? null,
    };
    return dependency;
  };
}

describe("earliestStart", () => {
  it("takes the latest due date in mode all", () => {
    const lookup = lookupOf({ 1: { due: day(10, 12) }, 2: { due: day(10, 15) } });

    expect(earliestStart(waiting({ dependencies: [1, 2] }), lookup)).toEqual(
      day(10, 15),
    );
  });

  it("takes the earliest due date in mode any", () => {
    const lookup = lookupOf({ 1: { due: day(10, 12) }, 2: { due: day(10, 15) } });

    expect(
      earliestStart(
        waiting({ dependencies: [2, 1], dependencyMode: "any" }),
        lookup,
      ),
    ).toEqual(day(10, 12));
  });

  it("adds the dependency delay", () => {
    const lookup = lookupOf({ 1: { due: day(10, 30) } });

    expect(
      earliestStart(waiting({ dependencies: [1], dependencyDelay: 3 }), lookup),
    ).toEqual(day(11, 2));
  });

  it("leaves out done dependencies, stale ones and those with no due date", () => {
    const lookup = lookupOf({
      1: { status: "done", due: day(10, 20) },
      2: {},
      3: { due: day(10, 12) },
    });

    // 4 is stale: no longer a task.
    expect(
      earliestStart(waiting({ dependencies: [1, 2, 4, 3] }), lookup),
    ).toEqual(day(10, 12));
    expect(earliestStart(waiting({ dependencies: [1, 2, 4] }), lookup)).toBe(
      null,
    );
  });
});

describe("hasDateConflict", () => {
  const lookup = lookupOf({ 1: { due: day(10, 12) } });

  it("is a start before the earliest its dependencies allow", () => {
    expect(
      hasDateConflict(waiting({ start: day(10, 11), dependencies: [1] }), lookup),
    ).toBe(true);
  });

  it("is not a start on the due date itself", () => {
    expect(
      hasDateConflict(waiting({ start: day(10, 12), dependencies: [1] }), lookup),
    ).toBe(false);
  });

  it("counts the dependency delay", () => {
    expect(
      hasDateConflict(
        waiting({ start: day(10, 13), dependencies: [1], dependencyDelay: 2 }),
        lookup,
      ),
    ).toBe(true);
  });

  it("never holds for a task without a start of its own", () => {
    expect(hasDateConflict(waiting({ dependencies: [1] }), lookup)).toBe(false);
  });

  it("never holds when no dependency takes part", () => {
    const none = lookupOf({ 1: { status: "done", due: day(10, 20) }, 2: {} });

    expect(
      hasDateConflict(
        waiting({ start: day(10, 1), dependencies: [1, 2, 3] }),
        none,
      ),
    ).toBe(false);
  });
});

describe("dependencyConflicts", () => {
  const lookup = lookupOf({
    1: { due: day(10, 12) },
    2: { due: day(10, 5) },
    3: { status: "done", due: day(10, 20) },
  });
  const task = waiting({ start: day(10, 8), dependencies: [1, 2, 3] });

  it("marks the dependencies whose due date is after the task's start", () => {
    expect(dependencyConflicts(task, 1, lookup)).toBe(true);
    expect(dependencyConflicts(task, 2, lookup)).toBe(false);
  });

  it("never marks a dependency that takes no part", () => {
    expect(dependencyConflicts(task, 3, lookup)).toBe(false);
  });

  it("marks none in mode any when the earliest due date allows the start", () => {
    const anyTask = waiting({
      start: day(10, 8),
      dependencies: [1, 2],
      dependencyMode: "any",
    });

    expect(dependencyConflicts(anyTask, 1, lookup)).toBe(false);
  });
});
