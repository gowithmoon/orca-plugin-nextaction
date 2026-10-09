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
    sequential?: boolean;
    /** Its place in the notes; defaults to its ID. */
    position?: number;
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
    sequential: setup.sequential ?? false,
    anomalies: [],
  };
  return {
    task: full,
    parentId: setup.parent ?? null,
    position: setup.position ?? id,
  };
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

describe("task graph: sequential blocking", () => {
  it("under a sequential parent, an earlier subtask to do blocks the later ones", () => {
    const graph = analyze([
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
    ]);

    expect(nextActionIds(graph)).toEqual([2]);
    expect(graph.entry(3)?.blockedBy).toEqual([
      { kind: "sequential", source: 3, waitingFor: [2] },
    ]);
  });

  it("an earlier subtask in the inbox, to do, in progress or waiting blocks", () => {
    for (const status of ["inbox", "todo", "doing", "waiting"] as const) {
      const graph = analyze([
        task(1, { sequential: true }),
        task(2, { status, parent: 1 }),
        task(3, { parent: 1 }),
      ]);

      expect(graph.entry(3)?.blockedBy).toEqual([
        { kind: "sequential", source: 3, waitingFor: [2] },
      ]);
    }
  });

  it("an earlier subtask that is done or someday does not block", () => {
    const graph = analyze([
      task(1, { sequential: true }),
      task(2, { status: "done", parent: 1 }),
      task(3, { status: "someday", parent: 1 }),
      task(4, { parent: 1 }),
      task(5, { parent: 1 }),
    ]);

    expect(graph.entry(4)?.blockedBy).toEqual([]);
    expect(graph.entry(5)?.blockedBy).toEqual([
      { kind: "sequential", source: 5, waitingFor: [4] },
    ]);
    expect(nextActionIds(graph)).toEqual([4]);
  });

  it("goes by place in the notes, not by ID", () => {
    // 3 was moved above 2 in the notes.
    const graph = analyze([
      task(1, { sequential: true }),
      task(2, { parent: 1, position: 20 }),
      task(3, { parent: 1, position: 10 }),
    ]);

    expect(nextActionIds(graph)).toEqual([3]);
    expect(graph.entry(2)?.blockedBy).toEqual([
      { kind: "sequential", source: 2, waitingFor: [3] },
    ]);
  });

  it("plain blocks grouping the subtasks do not matter", () => {
    // P{ 2, plain{ 3, 4 }, 5 }: all four have 1 as their parent task, in
    // that order (ADR 0003); the plain block only leaves gaps in positions.
    const graph = analyze([
      task(1, { sequential: true, position: 1 }),
      task(2, { status: "done", parent: 1, position: 2 }),
      task(3, { parent: 1, position: 4 }),
      task(4, { parent: 1, position: 5 }),
      task(5, { parent: 1, position: 6 }),
    ]);

    expect(nextActionIds(graph)).toEqual([3]);
    expect(graph.entry(5)?.blockedBy).toEqual([
      { kind: "sequential", source: 5, waitingFor: [3, 4] },
    ]);
  });

  it("subtasks of a parent with sequential off do not block each other", () => {
    const graph = analyze([
      task(1, { sequential: false }),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
    ]);

    expect(graph.entry(3)?.blockedBy).toEqual([]);
    expect(nextActionIds(graph)).toEqual([2, 3]);
  });

  it("is passed down to every descendant of a subtask held back, naming that subtask", () => {
    const graph = analyze([
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { status: "inbox", parent: 1 }),
      task(4, { parent: 3 }),
      task(5, { parent: 4 }),
    ]);

    // 4 is also held back by its own open subtask 5.
    expect(graph.entry(4)?.blockedBy).toEqual([
      { kind: "subtasks", source: 4, waitingFor: [5] },
      { kind: "sequential", source: 3, waitingFor: [2] },
    ]);
    expect(graph.entry(5)?.blockedBy).toEqual([
      { kind: "sequential", source: 3, waitingFor: [2] },
    ]);
    expect(nextActionIds(graph)).toEqual([2]);
  });

  it("nested sequential parents each hold back their own later subtasks", () => {
    // 1 (sequential) { 2, 3 (sequential) { 4, 5 } }
    const nested = (first: TaskStatus) =>
      analyze([
        task(1, { sequential: true }),
        task(2, { status: first, parent: 1 }),
        task(3, { sequential: true, parent: 1 }),
        task(4, { parent: 3 }),
        task(5, { parent: 3 }),
      ]);

    const before = nested("todo");
    expect(nextActionIds(before)).toEqual([2]);
    expect(before.entry(5)?.blockedBy).toEqual([
      { kind: "sequential", source: 5, waitingFor: [4] },
      { kind: "sequential", source: 3, waitingFor: [2] },
    ]);

    const after = nested("done");
    expect(nextActionIds(after)).toEqual([4]);
    expect(after.entry(5)?.blockedBy).toEqual([
      { kind: "sequential", source: 5, waitingFor: [4] },
    ]);
  });

  it("a sequential task's own place among its siblings does not hold back its first subtask", () => {
    // 1 is sequential but has no sequential parent: its first subtask is free.
    const graph = analyze([
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
    ]);

    expect(graph.entry(2)?.blockedBy).toEqual([]);
    expect(nextActionIds(graph)).toEqual([2]);
  });
});
