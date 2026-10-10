import { describe, expect, it } from "vitest";
import type {
  CalendarDate,
  DependencyMode,
  Task,
  TaskId,
  TaskStatus,
} from "../task/task";
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
    dependencies?: TaskId[];
    dependencyMode?: DependencyMode;
    dependencyDelay?: number;
    /** The logical day of its last completion; none when absent. */
    completedOn?: CalendarDate;
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
    urgency: 4,
    effort: 4,
    start: setup.start ?? null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    sequential: setup.sequential ?? false,
    dependencies: setup.dependencies ?? [],
    dependencyMode: setup.dependencyMode ?? "all",
    dependencyDelay: setup.dependencyDelay ?? 0,
    anomalies: [],
  };
  return {
    task: full,
    parentId: setup.parent ?? null,
    position: setup.position ?? id,
    ...(setup.completedOn && {
      lastCompletion: {
        at: new Date(
          Date.UTC(
            setup.completedOn.year,
            setup.completedOn.month - 1,
            setup.completedOn.day,
            10,
          ),
        ),
        day: setup.completedOn,
      },
    }),
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
    // 2 is done, so 1 is free even though 2 still has an open subtask; 3 is
    // out for its done parent, not blocked.
    const graph = analyze([
      task(1),
      task(2, { status: "done", parent: 1 }),
      task(3, { status: "todo", parent: 2 }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(3)?.blockedBy).toEqual([]);
    expect(nextActionIds(graph)).toEqual([1]);
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

  it("a parent in the inbox does not hold back its subtasks", () => {
    const graph = analyze([
      task(1, { status: "inbox" }),
      task(2, { parent: 1 }),
    ]);

    expect(graph.entry(2)?.parked).toBe(false);
    expect(nextActionIds(graph)).toEqual([2]);
  });
});

describe("task graph: done ancestor", () => {
  it("a task whose parent is done is not a next action, naming that parent", () => {
    const graph = analyze([
      task(1, { status: "done" }),
      task(2, { parent: 1 }),
    ]);

    expect(graph.entry(2)?.nextAction).toBe(false);
    expect(graph.entry(2)?.doneAncestor).toBe(1);
    expect(nextActionIds(graph)).toEqual([]);
  });

  it("a done ancestor task levels up keeps the whole branch out, naming the nearest done one", () => {
    // 1 (done) { 2 (todo) { 3 (done) { 4 } } }
    const graph = analyze([
      task(1, { status: "done" }),
      task(2, { status: "inbox", parent: 1 }),
      task(3, { status: "done", parent: 2 }),
      task(4, { parent: 3 }),
      task(5, { status: "done" }),
      task(6, { status: "waiting", parent: 5 }),
      task(7, { status: "doing", parent: 6 }),
    ]);

    expect(graph.entry(4)?.doneAncestor).toBe(3);
    expect(graph.entry(2)?.doneAncestor).toBe(1);
    expect(graph.entry(7)?.doneAncestor).toBe(5);
    expect(nextActionIds(graph)).toEqual([]);
  });

  it("once the ancestor task is no longer done, its descendants go by the other rules again", () => {
    for (const status of ["todo", "doing", "inbox"] as const) {
      const graph = analyze([
        task(1, { status }),
        task(2, { status: "inbox", parent: 1 }),
        task(3, { parent: 2 }),
      ]);

      expect(graph.entry(3)?.doneAncestor).toBeNull();
      expect(nextActionIds(graph)).toEqual([3]);
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

describe("task graph: dependency blocking", () => {
  it("a dependency on a task not done yet blocks the task, from the task itself", () => {
    const graph = analyze([task(1, { dependencies: [2] }), task(2)]);

    expect(graph.entry(1)?.nextAction).toBe(false);
    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [2], mode: "all" },
    ]);
  });

  it("an ancestor task's unmet dependency blocks every descendant, naming the ancestor as the source", () => {
    // 1 depends on 9; 3 sits two levels below 1 (ADR 0015).
    const graph = analyze([
      task(1, { status: "inbox", dependencies: [9] }),
      task(2, { status: "done", parent: 1 }),
      task(3, { parent: 2 }),
      task(9),
    ]);

    expect(graph.entry(3)?.nextAction).toBe(false);
    expect(graph.entry(3)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [9], mode: "all" },
    ]);
  });

  it("a dependency is met once its target is done, and the task is a next action again", () => {
    const graph = analyze([
      task(1, { dependencies: [2] }),
      task(2, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("a dependency on a task in someday is not met", () => {
    const graph = analyze([
      task(1, { dependencies: [2] }),
      task(2, { status: "someday" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [2], mode: "all" },
    ]);
  });

  it("a dependency on a target in the inbox or waiting is not met", () => {
    for (const status of ["inbox", "waiting", "doing"] as const) {
      const graph = analyze([
        task(1, { dependencies: [2] }),
        task(2, { status }),
      ]);

      expect(graph.entry(1)?.nextAction).toBe(false);
    }
  });

  it("a stale dependency (its target is not a task) counts as met", () => {
    // 7 is not in the snapshot: deleted, dropped or untagged.
    const graph = analyze([task(1, { dependencies: [7] })]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("with several dependencies, every one must be met; the reason lists the unmet ones in order", () => {
    const graph = analyze([
      task(1, { dependencies: [4, 2, 7, 3] }),
      task(2, { status: "done" }),
      task(3, { status: "someday" }),
      task(4),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [4, 3], mode: "all" },
    ]);
  });

  it("the task's own and its ancestors' dependency reasons are listed nearest first", () => {
    const graph = analyze([
      task(1, { status: "inbox", dependencies: [8] }),
      task(2, { parent: 1, dependencies: [9] }),
      task(8),
      task(9),
    ]);

    expect(graph.entry(2)?.blockedBy).toEqual([
      { kind: "dependencies", source: 2, waitingFor: [9], mode: "all" },
      { kind: "dependencies", source: 1, waitingFor: [8], mode: "all" },
    ]);
  });

  it("a met dependency of an ancestor does not hold its descendants back", () => {
    const graph = analyze([
      task(1, { status: "inbox", dependencies: [9] }),
      task(2, { parent: 1 }),
      task(9, { status: "done" }),
    ]);

    expect(graph.entry(2)?.nextAction).toBe(true);
  });
});

describe("task graph: dependency mode", () => {
  it("in mode any, one met dependency is enough: the task is not blocked", () => {
    const graph = analyze([
      task(1, { dependencies: [2, 3], dependencyMode: "any" }),
      task(2),
      task(3, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("in mode any, a task none of whose dependencies is met is blocked, waiting for all of them", () => {
    const graph = analyze([
      task(1, { dependencies: [3, 2], dependencyMode: "any" }),
      task(2, { status: "someday" }),
      task(3),
    ]);

    expect(graph.entry(1)?.nextAction).toBe(false);
    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [3, 2], mode: "any" },
    ]);
  });

  it("in mode any, a stale dependency is the one met: the task is not blocked", () => {
    // 7 is not in the snapshot: deleted, dropped or untagged.
    const graph = analyze([
      task(1, { dependencies: [2, 7], dependencyMode: "any" }),
      task(2),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("in mode all, one met dependency is not enough", () => {
    const graph = analyze([
      task(1, { dependencies: [2, 3], dependencyMode: "all" }),
      task(2),
      task(3, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [2], mode: "all" },
    ]);
  });

  it("an ancestor task in mode any with one met dependency does not hold its descendants back", () => {
    const graph = analyze([
      task(1, { status: "inbox", dependencies: [8, 9], dependencyMode: "any" }),
      task(2, { parent: 1 }),
      task(8),
      task(9, { status: "done" }),
    ]);

    expect(graph.entry(2)?.nextAction).toBe(true);
  });
});

describe("task graph: dependency delay", () => {
  // today is 2026-10-09.
  const day = (d: number): CalendarDate => ({ year: 2026, month: 10, day: d });

  it("in mode all, the delay counts from the latest completion", () => {
    const graph = analyze([
      task(1, { dependencies: [2, 3], dependencyDelay: 3 }),
      task(2, { status: "done", completedOn: day(5) }),
      task(3, { status: "done", completedOn: day(7) }),
    ]);

    expect(graph.entry(1)?.nextAction).toBe(false);
    expect(graph.entry(1)?.blockedBy).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 3,
        releasedOn: day(10),
      },
    ]);
  });

  it("is let in on its release day, not the day before", () => {
    // Done on the 6th with a delay of 3: released on the 9th, today.
    const onTheDay = analyze([
      task(1, { dependencies: [2], dependencyDelay: 3 }),
      task(2, { status: "done", completedOn: day(6) }),
    ]);
    // Done on the 7th: released on the 10th, tomorrow.
    const dayBefore = analyze([
      task(1, { dependencies: [2], dependencyDelay: 3 }),
      task(2, { status: "done", completedOn: day(7) }),
    ]);

    expect(onTheDay.entry(1)?.nextAction).toBe(true);
    expect(dayBefore.entry(1)?.nextAction).toBe(false);
  });

  it("a delay of 0 is the same as none: done today, let in today", () => {
    const graph = analyze([
      task(1, { dependencies: [2], dependencyDelay: 0 }),
      task(2, { status: "done", completedOn: day(9) }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("while dependencies are unmet, the reason is the dependencies, not the delay", () => {
    const graph = analyze([
      task(1, { dependencies: [2, 3], dependencyDelay: 3 }),
      task(2, { status: "done", completedOn: day(8) }),
      task(3),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      { kind: "dependencies", source: 1, waitingFor: [3], mode: "all" },
    ]);
  });

  it("in mode all, done dependencies without a record and stale ones are left out of the latest", () => {
    // 3 was set to done in Orca itself; 7 is not in the snapshot.
    const graph = analyze([
      task(1, { dependencies: [2, 3, 7], dependencyDelay: 2 }),
      task(2, { status: "done", completedOn: day(8) }),
      task(3, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 2,
        releasedOn: day(10),
      },
    ]);
  });

  it("in mode all, when no met dependency has a record, the task is let in at once", () => {
    const graph = analyze([
      task(1, { dependencies: [3, 7], dependencyDelay: 5 }),
      task(3, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("passes down from ancestor tasks, one reason per delayed link, nearest first", () => {
    const graph = analyze([
      task(1, { status: "inbox", dependencies: [8], dependencyDelay: 5 }),
      task(2, { parent: 1, dependencies: [9], dependencyDelay: 2 }),
      task(3, { parent: 2 }),
      task(8, { status: "done", completedOn: day(6) }),
      task(9, { status: "done", completedOn: day(8) }),
    ]);

    expect(graph.entry(3)?.nextAction).toBe(false);
    expect(graph.entry(3)?.blockedBy).toEqual([
      {
        kind: "dependencyDelay",
        source: 2,
        waitingFor: [],
        countedFrom: 9,
        releasedOn: day(10),
      },
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 8,
        releasedOn: day(11),
      },
    ]);
  });

  it("does not change what is a dependency cycle", () => {
    // 1 and 2 wait for each other; the delay plays no part.
    const graph = analyze([
      task(1, { dependencies: [2], dependencyDelay: 3 }),
      task(2, { dependencies: [1] }),
    ]);

    expect(graph.entry(1)?.blockedBy).toContainEqual({
      kind: "cycle",
      source: 1,
      waitingFor: [2],
    });
    expect(
      graph.entry(1)?.blockedBy.some((r) => r.kind === "dependencyDelay"),
    ).toBe(false);
  });

  it("in mode any, the delay counts from the earliest completion", () => {
    const graph = analyze([
      task(1, {
        dependencies: [2, 3, 4],
        dependencyMode: "any",
        dependencyDelay: 3,
      }),
      task(2, { status: "done", completedOn: day(7) }),
      task(3, { status: "done", completedOn: day(5) }),
      task(4),
    ]);

    // From the 5th, released on the 8th: already let in.
    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("in mode any, a done dependency without a completion record lets the task in at once", () => {
    // 3 was set to done in Orca itself: no record (GLOSSARY: 完成历史).
    const graph = analyze([
      task(1, {
        dependencies: [2, 3],
        dependencyMode: "any",
        dependencyDelay: 3,
      }),
      task(2, { status: "done", completedOn: day(8) }),
      task(3, { status: "done" }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
    expect(graph.entry(1)?.nextAction).toBe(true);
  });

  it("in mode any, a stale dependency lets the task in at once", () => {
    // 7 is not in the snapshot: deleted, dropped or untagged.
    const graph = analyze([
      task(1, {
        dependencies: [2, 7],
        dependencyMode: "any",
        dependencyDelay: 3,
      }),
      task(2, { status: "done", completedOn: day(8) }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([]);
  });

  it("in mode any, a dependency reopened since its last completion does not count", () => {
    // 3 was done on the 1st, then set back to do: only 2 is met.
    const graph = analyze([
      task(1, {
        dependencies: [2, 3],
        dependencyMode: "any",
        dependencyDelay: 3,
      }),
      task(2, { status: "done", completedOn: day(8) }),
      task(3, { status: "todo", completedOn: day(1) }),
    ]);

    expect(graph.entry(1)?.blockedBy).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 2,
        releasedOn: day(11),
      },
    ]);
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

describe("task graph: ancestor ratings", () => {
  const rated = (
    item: SnapshotTask,
    importance: Task["importance"],
    urgency: Task["urgency"],
  ): SnapshotTask => ({ ...item, task: { ...item.task, importance, urgency } });

  it("gives each task its ancestor tasks' importance and urgency, nearest first, whatever their status", () => {
    const graph = analyze([
      rated(task(1, { status: "someday" }), 7, 2),
      rated(task(2, { status: "done", parent: 1 }), 3, 6),
      rated(task(3, { parent: 2 }), 5, 5),
    ]);

    expect(graph.entry(3)?.ancestorRatings).toEqual([
      { importance: 3, urgency: 6 },
      { importance: 7, urgency: 2 },
    ]);
    expect(graph.entry(1)?.ancestorRatings).toEqual([]);
  });
});
