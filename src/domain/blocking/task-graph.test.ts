import { describe, expect, it } from "vitest";
import type { CalendarDate, Task, TaskId, TaskStatus } from "../task/task";
import {
  analyzeTaskGraph,
  type SnapshotTask,
  type TaskGraph,
} from "./task-graph";

const today: CalendarDate = { year: 2026, month: 10, day: 9 };

function task(
  id: TaskId,
  setup: {
    status?: TaskStatus;
    parent?: TaskId;
    start?: CalendarDate;
  } = {},
): SnapshotTask {
  const full: Task = {
    id,
    text: `task ${id}`,
    created: new Date("2026-01-01T00:00:00Z"),
    status: setup.status ?? "todo",
    importance: 4,
    effort: 4,
    start: setup.start ?? null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    anomalies: [],
  };
  return { task: full, parentId: setup.parent ?? null, position: id };
}

function analyze(tasks: SnapshotTask[], previewDays = 0): TaskGraph {
  return analyzeTaskGraph({ tasks }, { today, previewDays });
}

const nextActionIds = (graph: TaskGraph) =>
  graph.nextActions.map((entry) => entry.task.id);

describe("task graph: next actions", () => {
  it("only tasks to do or in progress can be next actions", () => {
    const graph = analyze([
      task(1, { status: "inbox" }),
      task(2, { status: "todo" }),
      task(3, { status: "doing" }),
      task(4, { status: "waiting" }),
      task(5, { status: "someday" }),
      task(6, { status: "done" }),
    ]);

    expect(nextActionIds(graph)).toEqual([2, 3]);
  });
});

describe("task graph: subtask blocking", () => {
  it("a subtask in the inbox, to do, in progress or waiting blocks its parent", () => {
    for (const status of ["inbox", "todo", "doing", "waiting"] as const) {
      const graph = analyze([task(1), task(2, { status, parent: 1 })]);

      expect(graph.entry(1)?.nextAction).toBe(false);
      expect(graph.entry(1)?.blockedBy).toEqual([
        { kind: "subtasks", source: 1, waitingFor: [2] },
      ]);
    }
  });

  it("the reason lists every direct subtask neither done nor someday, in note order, from the task itself", () => {
    const graph = analyze([
      task(1),
      task(2, { status: "done", parent: 1 }),
      task(3, { status: "waiting", parent: 1 }),
      task(4, { status: "someday", parent: 1 }),
      task(5, { status: "inbox", parent: 1 }),
      task(6, { status: "todo", parent: 5 }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "subtasks", source: 1, waitingFor: [3, 5] },
    ]);
  });

  it("a subtask that is done or someday does not block its parent", () => {
    const graph = analyze([
      task(1),
      task(2, { status: "done", parent: 1 }),
      task(3, { status: "someday", parent: 1 }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(nextActionIds(graph)).toEqual([1]);
  });

  it("only direct subtasks count, not deeper descendants", () => {
    // 2 is done, so 1 is free even though 2 still has an open subtask.
    const graph = analyze([
      task(1),
      task(2, { status: "done", parent: 1 }),
      task(3, { status: "todo", parent: 2 }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(nextActionIds(graph)).toEqual([1, 3]);
  });

  it("subtask blocking is not passed down to the blocked task's subtasks", () => {
    const graph = analyze([
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
    ]);

    expect(nextActionIds(graph)).toEqual([2, 3]);
  });
});

describe("task graph: parked subtree", () => {
  it("a task under a waiting or someday ancestor is not a next action", () => {
    for (const status of ["waiting", "someday"] as const) {
      const graph = analyze([
        task(1, { status }),
        task(2, { status: "done", parent: 1 }),
        task(3, { parent: 2 }),
      ]);

      expect(graph.entry(3)?.parked).toBe(true);
      expect(graph.entry(3)?.blockedBy).toEqual([]);
      expect(nextActionIds(graph)).toEqual([]);
    }
  });

  it("a task that is waiting or someday is parked itself", () => {
    const graph = analyze([task(1, { status: "someday" })]);

    expect(graph.entry(1)?.parked).toBe(true);
  });

  it("a parent in the inbox or done does not hold back its subtasks", () => {
    for (const status of ["inbox", "done"] as const) {
      const graph = analyze([task(1, { status }), task(2, { parent: 1 })]);

      expect(graph.entry(2)?.parked).toBe(false);
      expect(nextActionIds(graph)).toEqual([2]);
    }
  });
});

describe("task graph: effective start", () => {
  const oct = (day: number): CalendarDate => ({ year: 2026, month: 10, day });

  it("is the latest start among the task and all its ancestor tasks", () => {
    const graph = analyze([
      task(1, { start: oct(20) }),
      task(2, { status: "done", parent: 1, start: oct(5) }),
      task(3, { parent: 2, start: oct(12) }),
    ]);

    expect(graph.entry(3)?.effectiveStart).toEqual(oct(20));
    expect(graph.entry(2)?.effectiveStart).toEqual(oct(20));
  });

  it("is empty when neither the task nor any ancestor task has a start", () => {
    const graph = analyze([task(1), task(2, { parent: 1 })]);

    expect(graph.entry(2)?.effectiveStart).toBeNull();
  });

  it("a task can be a next action on its effective start day, not before", () => {
    const graph = analyze([
      task(1, { start: oct(9) }),
      task(2, { start: oct(10) }),
      task(3, { start: oct(8) }),
    ]);

    expect(nextActionIds(graph)).toEqual([1, 3]);
  });

  it("an ancestor task's later start keeps its descendants out", () => {
    const graph = analyze([
      task(1, { status: "inbox", start: oct(10) }),
      task(2, { parent: 1 }),
    ]);

    expect(nextActionIds(graph)).toEqual([]);
  });

  it("the preview days let a start that many days ahead in, and no further", () => {
    const graph = analyze(
      [task(1, { start: oct(12) }), task(2, { start: oct(13) })],
      3,
    );

    expect(nextActionIds(graph)).toEqual([1]);
  });
});
