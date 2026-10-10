import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import { type AllTasksNode, createReadAllTasks } from "./read-all-tasks";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readAllTasks = createReadAllTasks({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readAllTasks };
}

/** A tree written as ids: a leaf as its id, a node with children as [id, children]. */
type Shape = TaskId | [TaskId, Shape[]];

function shape(nodes: readonly AllTasksNode[]): Shape[] {
  return nodes.map((node) =>
    node.children.length === 0
      ? node.task.id
      : [node.task.id, shape(node.children)],
  );
}

describe("read all tasks", () => {
  it("lists every task not done, of any status, in note order", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "waiting" }, { position: 30 });
    repository.addTask({ id: 2, status: "inbox" }, { position: 10 });
    repository.addTask({ id: 3, status: "someday" }, { position: 50 });
    repository.addTask({ id: 4, status: "doing" }, { position: 20 });
    repository.addTask({ id: 5, status: "todo" }, { position: 40 });

    const read = await readAllTasks();

    expect(shape(read.tree)).toEqual([2, 4, 1, 5, 3]);
  });

  it("puts each subtask under its parent task, plain blocks in between not counting", async () => {
    const { repository, readAllTasks } = setup();
    // A page task (no parent block) holding a plain block holding a task.
    repository.addTask({ id: 1, text: "Move house", status: "todo" });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "inbox" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 6, status: "waiting" });

    const read = await readAllTasks();

    expect(shape(read.tree)).toEqual([[1, [[3, [4]], 5]], 6]);
  });

  describe("done tasks", () => {
    it("keeps a done subtask of a task not done, and its done subtasks, faded as done", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "doing" });
      repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([[1, [[2, [3]], 4]]]);
      expect(fades(read.tree)).toEqual([
        [1, null],
        [2, "done"],
        [3, "done"],
        [4, null],
      ]);
    });

    it("keeps a done task holding a task not done, faded as done", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addBlock(2, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "someday" }, { parentId: 3 });
      repository.addTask({ id: 5, status: "done" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([[1, [[3, [4]], 5]]]);
      expect(fades(read.tree)).toEqual([
        [1, "done"],
        [3, "done"],
        [4, null],
        [5, "done"],
      ]);
    });

    it("leaves out a top-level task done with all its descendant tasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "done" });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "done" });

      const read = await readAllTasks();

      expect(shape(read.tree)).toEqual([1]);
    });

    it("shows each task once, however deep and mixed the subtree", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "done" });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
      repository.addBlock(4, { parentId: 3 });
      repository.addTask({ id: 5, status: "inbox" }, { parentId: 4 });
      repository.addTask({ id: 6, status: "done" }, { parentId: 1 });

      const read = await readAllTasks({ keep: 6 });

      expect(fades(read.tree).map(([id]) => id)).toEqual([1, 2, 3, 5, 6]);
    });
  });

  describe("blocked mark", () => {
    it("marks a task to do or in progress whose dependency is not met", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "todo", dependencies: [1] });
      repository.addTask({ id: 3, status: "doing", dependencies: [1] });
      repository.addTask({ id: 4, status: "done" });
      repository.addTask({ id: 5, status: "todo", dependencies: [4] });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, true],
        [3, true],
        [5, false],
      ]);
    });

    it("marks a subtask blocked by its ancestor task's dependency", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "todo", dependencies: [1] });
      repository.addBlock(3, { parentId: 2 });
      repository.addTask({ id: 4, status: "doing" }, { parentId: 3 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, true],
        [4, true],
      ]);
    });

    it("marks later subtasks of a sequential parent, and their subtasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo", sequential: true });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
      repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
        [3, true],
        [4, true],
      ]);
    });

    it("marks the tasks on a dependency cycle", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo", dependencies: [2] });
      repository.addTask({ id: 2, status: "doing", dependencies: [1] });
      // A subtask depending on its ancestor task is a cycle too: the parent,
      // otherwise held back only by its subtasks, is marked for the cycle.
      repository.addTask({ id: 3, status: "todo" });
      repository.addTask(
        { id: 4, status: "todo", dependencies: [3] },
        { parentId: 3 },
      );

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, true],
        [2, true],
        [3, true],
        [4, true],
      ]);
    });

    it("does not mark a task held back only by its subtasks", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "doing" });
      repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
      ]);
    });

    it("does not mark a blocked task in the inbox, waiting or someday", async () => {
      const { repository, readAllTasks } = setup();
      repository.addTask({ id: 1, status: "todo" });
      repository.addTask({ id: 2, status: "inbox", dependencies: [1] });
      repository.addTask({ id: 3, status: "waiting", dependencies: [1] });
      repository.addTask({ id: 4, status: "someday", dependencies: [1] });

      const read = await readAllTasks();

      expect(marks(read.tree)).toEqual([
        [1, false],
        [2, false],
        [3, false],
        [4, false],
      ]);
    });
  });
});

describe("read all tasks, keeping the task being viewed", () => {
  it("keeps a task given as `keep` that would leave the tree, in its place, faded as kept", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" });

    const read = await readAllTasks({ keep: 2 });

    expect(shape(read.tree)).toEqual([1, 2, 4]);
    expect(fades(read.tree)).toEqual([
      [1, null],
      [2, "kept"],
      [4, null],
    ]);
  });

  it("shows only the ancestor tasks of a kept task deep in a done subtree, for where it sits", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "done" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "done" }, { parentId: 3 });
    repository.addTask({ id: 5, status: "done" }, { parentId: 2 });
    repository.addTask({ id: 6, status: "done" }, { parentId: 1 });

    const read = await readAllTasks({ keep: 3 });

    expect(shape(read.tree)).toEqual([[1, [[2, [3]]]]]);
    expect(fades(read.tree)).toEqual([
      [1, "done"],
      [2, "done"],
      [3, "kept"],
    ]);
  });

  it("does not mark as kept a task given as `keep` that is in the tree anyway", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });

    const read = await readAllTasks({ keep: 2 });

    expect(fades(read.tree)).toEqual([
      [1, null],
      [2, "done"],
    ]);
  });

  it("does not keep a task given as `keep` once it is no longer a task", async () => {
    const { repository, readAllTasks } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    await repository.dropTask(2);

    const read = await readAllTasks({ keep: 2 });

    expect(shape(read.tree)).toEqual([1]);
  });
});

/** Every node in the tree, depth first, with whether it is marked blocked. */
function marks(nodes: readonly AllTasksNode[]): [TaskId, boolean][] {
  return nodes.flatMap((node) => [
    [node.task.id, node.blocked] as [TaskId, boolean],
    ...marks(node.children),
  ]);
}

/** Every node in the tree, depth first, with why it is faded (`null`: not). */
function fades(nodes: readonly AllTasksNode[]): [TaskId, string | null][] {
  return nodes.flatMap((node) => [
    [node.task.id, node.faded] as [TaskId, string | null],
    ...fades(node.children),
  ]);
}
