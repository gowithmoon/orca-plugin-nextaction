import { describe, expect, it } from "vitest";
import type {
  CalendarDate,
  DependencyMode,
  Task,
  TaskId,
  TaskStatus,
} from "../task/task";
import {
  dependencyTargetsThatCycle,
  sequentialCycle,
  targetsThatCycle,
} from "./dependency-cycles";
import { analyzeTaskGraph, type SnapshotTask } from "./task-graph";

const today: CalendarDate = { year: 2026, month: 10, day: 9 };

function task(
  id: TaskId,
  setup: {
    status?: TaskStatus;
    parent?: TaskId;
    sequential?: boolean;
    dependencies?: TaskId[];
    dependencyMode?: DependencyMode;
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
    start: null,
    due: null,
    contexts: [],
    labels: [],
    note: null,
    sequential: setup.sequential ?? false,
    dependencies: setup.dependencies ?? [],
    dependencyMode: setup.dependencyMode ?? "all",
    anomalies: [],
  };
  return {
    task: full,
    parentId: setup.parent ?? null,
    position: setup.position ?? id,
  };
}

const analyze = (tasks: SnapshotTask[]) =>
  analyzeTaskGraph({ tasks }, { today, previewDays: 0 });

/** The cycle reason of task `id`, `undefined` when it is on no cycle. */
const cycleOf = (tasks: SnapshotTask[], id: TaskId) =>
  analyze(tasks)
    .entry(id)
    ?.blockedBy.find((reason) => reason.kind === "cycle");

describe("dependency cycles at read time", () => {
  it("two tasks depending on each other are both blocked by a cycle, naming the other", () => {
    const tasks = [
      task(1, { dependencies: [2] }),
      task(2, { dependencies: [1] }),
    ];

    expect(cycleOf(tasks, 1)).toEqual({
      kind: "cycle",
      source: 1,
      waitingFor: [2],
    });
    expect(cycleOf(tasks, 2)).toEqual({
      kind: "cycle",
      source: 2,
      waitingFor: [1],
    });
  });

  it("a task on a cycle is not a next action", () => {
    const graph = analyze([
      task(1, { dependencies: [2] }),
      task(2, { dependencies: [1] }),
      task(3),
    ]);

    expect(graph.nextActions.map((entry) => entry.task.id)).toEqual([3]);
  });

  it("a task depending on itself is on a cycle", () => {
    expect(cycleOf([task(1, { dependencies: [1] })], 1)).toEqual({
      kind: "cycle",
      source: 1,
      waitingFor: [1],
    });
  });

  it("a parent depending on its own descendant puts that descendant on a cycle: it waits for itself", () => {
    const tasks = [
      task(1, { dependencies: [3] }),
      task(2, { parent: 1 }),
      task(3, { parent: 2 }),
    ];

    expect(cycleOf(tasks, 3)).toEqual({
      kind: "cycle",
      source: 3,
      waitingFor: [3],
    });
    // The parent and the task in between wait for it, but are on no cycle.
    expect(cycleOf(tasks, 1)).toBeUndefined();
    expect(cycleOf(tasks, 2)).toBeUndefined();
  });

  it("a descendant depending on its ancestor puts every task between them on a cycle", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 2, dependencies: [1] }),
      task(4, { parent: 1 }),
    ];

    expect(cycleOf(tasks, 1)?.waitingFor).toEqual([2]);
    expect(cycleOf(tasks, 2)?.waitingFor).toEqual([3]);
    expect(cycleOf(tasks, 3)?.waitingFor).toEqual([1]);
    expect(cycleOf(tasks, 4)).toBeUndefined();
  });

  it("under a sequential parent, an earlier subtask depending on a later one makes a cycle", () => {
    const tasks = [
      task(1, { sequential: true }),
      task(2, { parent: 1, dependencies: [3] }),
      task(3, { parent: 1 }),
    ];

    expect(cycleOf(tasks, 2)?.waitingFor).toEqual([3]);
    expect(cycleOf(tasks, 3)?.waitingFor).toEqual([2]);
  });

  it("under a sequential parent, a later subtask depending on an earlier one makes no cycle", () => {
    const tasks = [
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { parent: 1, dependencies: [2] }),
    ];

    expect(cycleOf(tasks, 2)).toBeUndefined();
    expect(cycleOf(tasks, 3)).toBeUndefined();
  });

  it("the descendants of a later subtask wait for every earlier subtask too", () => {
    // 5 (below the later subtask 4) waits for the earlier subtask 2, which
    // depends on 5.
    const tasks = [
      task(1, { sequential: true }),
      task(2, { parent: 1, dependencies: [5] }),
      task(4, { parent: 1 }),
      task(5, { parent: 4 }),
    ];

    expect(cycleOf(tasks, 2)?.waitingFor).toEqual([5]);
    expect(cycleOf(tasks, 5)?.waitingFor).toEqual([2]);
  });

  it("a long chain across dependencies, subtasks and sequential order is a cycle", () => {
    // 1 depends on 12; 12 comes after 11 under the sequential 10; 11 waits
    // for its subtask 13; 13 depends on 1.
    const tasks = [
      task(1, { dependencies: [12] }),
      task(10, { sequential: true }),
      task(11, { parent: 10 }),
      task(13, { parent: 11, dependencies: [1], position: 12 }),
      task(12, { parent: 10, position: 13 }),
    ];

    for (const id of [1, 11, 12, 13]) {
      expect(cycleOf(tasks, id)).toBeDefined();
    }
    expect(cycleOf(tasks, 10)).toBeUndefined();
  });

  it("a stale dependency (its target is not a task) makes no cycle", () => {
    const tasks = [task(1, { dependencies: [9] }), task(2, { parent: 1 })];

    expect(cycleOf(tasks, 1)).toBeUndefined();
    expect(cycleOf(tasks, 2)).toBeUndefined();
  });

  it("goes by structure only: statuses and the dependency mode do not matter", () => {
    const tasks = [
      task(1, { status: "done", dependencies: [2, 3], dependencyMode: "any" }),
      task(2, { status: "someday", dependencies: [1] }),
      task(3),
    ];

    expect(cycleOf(tasks, 1)?.waitingFor).toEqual([2]);
    expect(cycleOf(tasks, 2)?.waitingFor).toEqual([1]);
    expect(cycleOf(tasks, 3)).toBeUndefined();
  });
});

describe("would setting dependencies make a cycle", () => {
  it("marks the task's own descendants as below it", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 2 }),
      task(4),
    ];

    expect(dependencyTargetsThatCycle({ tasks }, 1)).toEqual(
      new Map([
        [1, "below"],
        [2, "below"],
        [3, "below"],
      ]),
    );
  });

  it("marks the tasks that already wait for the task, or for something below it, as waiting for it", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1 }),
      // Waits for 1 through a dependency.
      task(3, { dependencies: [1] }),
      // Waits for 3, so for 1 too.
      task(4, { dependencies: [3] }),
      // Its subtask 6 depends on 2, below 1.
      task(5),
      task(6, { parent: 5, dependencies: [2] }),
      task(7),
    ];

    const marked = dependencyTargetsThatCycle({ tasks }, 1);

    expect(marked.get(3)).toBe("waits");
    expect(marked.get(4)).toBe("waits");
    expect(marked.get(5)).toBe("waits");
    expect(marked.get(6)).toBe("waits");
    expect(marked.has(7)).toBe(false);
  });

  it("an ancestor task is marked: the task's parent waits for it", () => {
    const tasks = [task(1), task(2, { parent: 1 })];

    expect(dependencyTargetsThatCycle({ tasks }, 2).get(1)).toBe("waits");
  });

  it("an earlier sibling under a sequential parent is not marked, a later one is", () => {
    const tasks = [
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
    ];

    expect(dependencyTargetsThatCycle({ tasks }, 3).has(2)).toBe(false);
    expect(dependencyTargetsThatCycle({ tasks }, 2).get(3)).toBe("waits");
  });

  it("only targets added to the list count: a dependency already held is left alone", () => {
    // 1 and 2 already wait for each other (made in Orca). Removing a
    // dependency, or keeping one, never makes a cycle.
    const tasks = [
      task(1, { dependencies: [2, 3] }),
      task(2, { dependencies: [1] }),
      task(3),
      task(4, { dependencies: [1] }),
    ];

    expect(targetsThatCycle({ tasks }, 1, [2])).toEqual([]);
    expect(targetsThatCycle({ tasks }, 1, [2, 4, 3])).toEqual([4]);
  });

  it("a stale target makes no cycle", () => {
    expect(targetsThatCycle({ tasks: [task(1)] }, 1, [9])).toEqual([]);
  });
});

describe("would turning sequential on make a cycle", () => {
  it("an earlier subtask depending on a later one makes a cycle: names the two", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1, dependencies: [3] }),
      task(3, { parent: 1 }),
    ];

    expect(sequentialCycle({ tasks }, 1)).toEqual({
      waiting: 3,
      waitingFor: 2,
    });
  });

  it("an earlier subtask waiting for something below a later one makes a cycle", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1, dependencies: [5] }),
      task(4, { parent: 1 }),
      task(5, { parent: 4 }),
    ];

    expect(sequentialCycle({ tasks }, 1)).toEqual({
      waiting: 5,
      waitingFor: 2,
    });
  });

  it("subtasks depending on earlier ones, or on nothing, make no cycle", () => {
    const tasks = [
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 1, dependencies: [2] }),
    ];

    expect(sequentialCycle({ tasks }, 1)).toBeNull();
  });

  it("a task already sequential, or not a task, makes no new cycle", () => {
    const tasks = [
      task(1, { sequential: true }),
      task(2, { parent: 1, dependencies: [3] }),
      task(3, { parent: 1 }),
    ];

    expect(sequentialCycle({ tasks }, 1)).toBeNull();
    expect(sequentialCycle({ tasks }, 9)).toBeNull();
  });
});

describe("what would make a cycle agrees with what reading finds", () => {
  /** A small pseudo-random task tree with dependencies, the same each run. */
  function randomTasks(seed: number): SnapshotTask[] {
    let state = seed;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const tasks: SnapshotTask[] = [];
    for (let id = 1; id <= 8; id += 1) {
      const parent =
        id > 1 && random() < 0.6 ? Math.ceil(random() * (id - 1)) : undefined;
      const dependencies = random() < 0.3 ? [Math.ceil(random() * 9)] : [];
      tasks.push(
        task(id, { parent, dependencies, sequential: random() < 0.3 }),
      );
    }
    return tasks;
  }
  const onAnyCycle = (tasks: SnapshotTask[]) =>
    tasks.some((item) => cycleOf(tasks, item.task.id) !== undefined);
  const withTask = (
    tasks: SnapshotTask[],
    id: TaskId,
    change: Partial<Task>,
  ): SnapshotTask[] =>
    tasks.map((item) =>
      item.task.id === id
        ? { ...item, task: { ...item.task, ...change } }
        : item,
    );

  it("adding a dependency is refused exactly when reading would then find a cycle", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const tasks = randomTasks(seed);
      if (onAnyCycle(tasks)) continue;
      for (const item of tasks) {
        for (let target = 1; target <= 8; target += 1) {
          const targets = [...item.task.dependencies, target];
          const after = withTask(tasks, item.task.id, {
            dependencies: targets,
          });
          expect(
            targetsThatCycle({ tasks }, item.task.id, targets).length > 0,
          ).toBe(onAnyCycle(after));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("turning sequential on is refused exactly when reading would then find a cycle", () => {
    let checked = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const tasks = randomTasks(seed);
      if (onAnyCycle(tasks)) continue;
      for (const item of tasks) {
        const after = withTask(tasks, item.task.id, { sequential: true });
        expect(sequentialCycle({ tasks }, item.task.id) !== null).toBe(
          onAnyCycle(after),
        );
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
