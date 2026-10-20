import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { CalendarDate, TaskId } from "../../domain/task/task";
import type { CompletionHistoryRead } from "../ports/task-repository";
import {
  createReadTaskMap,
  type TaskMapNode,
  type TaskMapRead,
} from "./read-task-map";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readTaskMap = createReadTaskMap({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readTaskMap };
}

/** A task tree as nested IDs: a leaf is its ID, a box `[id, children]`. */
type Shape = TaskId | [TaskId, Shape[]];

function shape(node: TaskMapNode): Shape {
  return node.children.length === 0
    ? node.task.id
    : [node.task.id, node.children.map(shape)];
}

/** Each area: its project's ID (`null`: no project), its task trees. */
function areas(read: TaskMapRead): [number | null, Shape[]][] {
  return read.areas.map((area) => [
    area.kind === "project" ? area.project.id : null,
    area.tasks.map(shape),
  ]);
}

/** A calendar day written `yyyy-mm-dd`. */
function day(text: string): CalendarDate {
  const [year, month, date] = text.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return { year, month, day: date };
}

/** A done task's completion recorded at noon on each of `days`. */
function completedOn(...days: string[]): {
  completionHistory: CompletionHistoryRead;
} {
  return {
    completionHistory: {
      kind: "readable",
      history: days.map((text) => ({
        at: new Date(`${text}T12:00:00+08:00`),
        day: day(text),
      })),
    },
  };
}

/** The dependency edges as `[from, to]`, in the order read. */
function edges(read: TaskMapRead): [TaskId, TaskId][] {
  return read.dependencyEdges.map((edge) => [edge.from, edge.to]);
}

describe("read task map, areas", () => {
  it("puts a project's tasks in its box and the tasks of no project in the no-project area, projects first in note order", async () => {
    const { repository, readTaskMap } = setup();
    repository.addProject({ id: 1, status: "active", text: "Move house" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addProject({ id: 3, status: "planning", text: "Garden" });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "todo" });

    const read = await readTaskMap();

    expect(areas(read)).toEqual([
      [1, [2]],
      [3, [4]],
      [null, [5]],
    ]);
    const first = read.areas[0];
    expect(first?.kind === "project" && first.project).toMatchObject({
      status: "active",
      text: "Move house",
    });
  });
});

describe("read task map, ownership", () => {
  it("puts a task where its 所属项目 says: under another project's block, or set from outside any project block, with its subtasks", async () => {
    const { repository, readTaskMap } = setup();
    // Set to project 1 from a journal, above the project block.
    repository.addTask({ id: 7, status: "todo" }, { project: [1] });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addProject({ id: 5, status: "active" });
    // Under project 1's block, set to project 5: project 5's.
    repository.addTask(
      { id: 4, status: "todo" },
      { parentId: 1, project: [5] },
    );
    repository.addTask({ id: 9, status: "todo" });

    const read = await readTaskMap();

    expect(areas(read)).toEqual([
      [1, [[7, [8]], 2]],
      [5, [4]],
      [null, [9]],
    ]);
  });
});

describe("read task map, done tasks", () => {
  it("leaves out done tasks, an area left with none, and counts a parent task's done subtasks of all its subtasks in its head", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 1 });
    // Only a done subtask below it: shown as a card, 1/1 done.
    repository.addTask({ id: 5, status: "doing" });
    repository.addTask({ id: 6, status: "done" }, { parentId: 5 });
    repository.addTask({ id: 7, status: "done" });
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "done" }, { parentId: 10 });

    const read = await readTaskMap();

    expect(areas(read)).toEqual([[null, [[1, [3]], 5]]]);
    const [parent, single] = read.areas[0]?.tasks ?? [];
    expect(parent?.subtasks).toEqual({ done: 2, total: 3 });
    expect(single?.subtasks).toEqual({ done: 1, total: 1 });
    expect(parent?.children[0]?.subtasks).toEqual({ done: 0, total: 0 });
  });

  it("still shows a done parent task as the box around its subtasks not done", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "done" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

    const read = await readTaskMap();

    expect(areas(read)).toEqual([[null, [[1, [2]]]]]);
  });
});

describe("read task map, sequence edges", () => {
  it("links the adjacent subtasks shown of a sequential parent task, skipping the done ones, and of no other parent task", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo", sequential: true });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 7, status: "todo" });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addTask({ id: 9, status: "todo" }, { parentId: 7 });

    const read = await readTaskMap();

    expect(read.sequenceEdges).toEqual([
      { from: 3, to: 5 },
      { from: 5, to: 6 },
    ]);
    const [sequential, plain] = read.areas[0]?.tasks ?? [];
    expect(sequential?.sequential).toBe(true);
    expect(plain?.sequential).toBe(false);
  });
});

describe("read task map, cards", () => {
  it("says of each task whether it is a next action, marked blocked, or faded for waiting or someday", async () => {
    const { repository, readTaskMap } = setup();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 1, status: "todo" }, { parentId: 10 });
    repository.addTask(
      { id: 2, status: "todo", dependencies: [1] },
      { parentId: 10 },
    );
    repository.addTask({ id: 3, status: "waiting" }, { parentId: 10 });
    repository.addTask({ id: 4, status: "someday" }, { parentId: 10 });

    const read = await readTaskMap();

    const cards = (read.areas[0]?.tasks ?? []).map((node) => [
      node.task.id,
      { nextAction: node.nextAction, blocked: node.blocked, faded: node.faded },
    ]);
    expect(cards).toEqual([
      [1, { nextAction: true, blocked: false, faded: false }],
      [2, { nextAction: false, blocked: true, faded: false }],
      [3, { nextAction: false, blocked: false, faded: true }],
      [4, { nextAction: false, blocked: false, faded: true }],
    ]);
  });
});

describe("read task map, mirrors", () => {
  it("shows a task once however many mirror blocks it has", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo", sequential: true });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
    const before = await readTaskMap();

    repository.addMirror(50, 2);
    repository.addMirror(51, 1);
    const after = await readTaskMap();

    expect(areas(after)).toEqual([[null, [[1, [2, 3]]]]]);
    expect(after).toEqual(before);
  });
});

describe("read task map, dependency edges", () => {
  it("runs a dependency edge from the task depended on to the task depending on it, a parent task included", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", dependencies: [1, 3] });
    repository.addTask({ id: 3, status: "todo" });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });

    const read = await readTaskMap();

    expect(edges(read)).toEqual([
      [1, 2],
      [3, 2],
    ]);
  });

  it("marks a dependency edge of mode any, one with a date conflict, and one on a dependency cycle", async () => {
    const { repository, readTaskMap } = setup();
    // 2 depends on 1 in mode any; 3 starts before 1 is due.
    repository.addTask({ id: 1, status: "todo", due: day("2026-10-20") });
    repository.addTask({
      id: 2,
      status: "todo",
      dependencies: [1],
      dependencyMode: "any",
    });
    repository.addTask({
      id: 3,
      status: "todo",
      start: day("2026-10-15"),
      dependencies: [1],
    });
    // 4 and 5 wait for each other; 6 waits for 5, off the cycle.
    repository.addTask({ id: 4, status: "todo", dependencies: [5] });
    repository.addTask({ id: 5, status: "todo", dependencies: [4] });
    repository.addTask({ id: 6, status: "todo", dependencies: [5] });

    const read = await readTaskMap();

    expect(
      read.dependencyEdges.map(({ from, to, any, conflict, cycle }) => [
        from,
        to,
        { any, conflict, cycle },
      ]),
    ).toEqual([
      [1, 2, { any: true, conflict: false, cycle: false }],
      [1, 3, { any: false, conflict: true, cycle: false }],
      [5, 4, { any: false, conflict: false, cycle: true }],
      [4, 5, { any: false, conflict: false, cycle: true }],
      [5, 6, { any: false, conflict: false, cycle: false }],
    ]);
  });

  it("gives the dependency delay to the task depending, not to an edge, and none to a task with no dependency drawn", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo" });
    repository.addTask({
      id: 3,
      status: "todo",
      dependencies: [1, 2],
      dependencyDelay: 3,
    });
    repository.addTask({ id: 4, status: "todo", dependencyDelay: 2 });

    const read = await readTaskMap();

    const delays = (read.areas[0]?.tasks ?? []).map((node) => [
      node.task.id,
      node.dependencyDelay,
    ]);
    expect(delays).toEqual([
      [1, 0],
      [2, 0],
      [3, 3],
      [4, 0],
    ]);
  });

  it("marks the tasks on a dependency cycle, and no task only waiting for one", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo", dependencies: [2] });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });
    repository.addTask({ id: 3, status: "todo", dependencies: [2] });

    const read = await readTaskMap();

    const cycle = (read.areas[0]?.tasks ?? []).map((node) => [
      node.task.id,
      node.cycle,
    ]);
    expect(cycle).toEqual([
      [1, true],
      [2, true],
      [3, false],
    ]);
  });

  it("still shows a done task, faded, with its edge, while a task depending on it waits for its release day", async () => {
    const { repository, readTaskMap } = setup();
    // Done on 10-08, delay 3: released on 10-11, after today (10-09).
    repository.addTask({ id: 1, status: "done" }, completedOn("2026-10-08"));
    repository.addTask({
      id: 2,
      status: "todo",
      dependencies: [1],
      dependencyDelay: 3,
    });
    // Done on 10-01, delay 3: released on 10-04, already past.
    repository.addTask({ id: 3, status: "done" }, completedOn("2026-10-01"));
    repository.addTask({
      id: 4,
      status: "todo",
      dependencies: [3],
      dependencyDelay: 3,
    });

    const read = await readTaskMap();

    expect(areas(read)).toEqual([[null, [1, 2, 4]]]);
    expect(read.areas[0]?.tasks[0]?.faded).toBe(true);
    expect(edges(read)).toEqual([[1, 2]]);
  });

  it("draws no edge for a stale dependency", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", dependencies: [99, 1] });
    repository.addTask({ id: 3, status: "todo", dependencies: [98] });

    const read = await readTaskMap();

    expect(edges(read)).toEqual([[1, 2]]);
  });
});
