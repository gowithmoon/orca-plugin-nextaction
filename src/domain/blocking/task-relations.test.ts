import { describe, expect, it } from "vitest";
import type { TaskId } from "../task/task";
import { buildTaskRelations, type RelatedTask } from "./task-relations";

function task(
  id: TaskId,
  setup: {
    parent?: TaskId;
    sequential?: boolean;
    dependencies?: TaskId[];
    /** Its place in the notes; defaults to its ID. */
    position?: number;
  } = {},
): RelatedTask {
  return {
    task: {
      id,
      sequential: setup.sequential ?? false,
      dependencies: setup.dependencies ?? [],
    },
    parentId: setup.parent ?? null,
    position: setup.position ?? id,
  };
}

const ids = (items: readonly RelatedTask[]) =>
  items.map((item) => item.task.id);

describe("task relations: dependencies", () => {
  it("a task waits for each task it depends on, in the order the notes hold them, and each is waited for by it", () => {
    const relations = buildTaskRelations([
      task(1),
      task(2),
      task(3, { dependencies: [2, 1] }),
    ]);

    expect(relations.waitsFor(3)).toEqual([
      { kind: "dependency", waiting: 3, waitingFor: 2 },
      { kind: "dependency", waiting: 3, waitingFor: 1 },
    ]);
    expect(relations.waitersOf(1)).toEqual([
      { kind: "dependency", waiting: 3, waitingFor: 1 },
    ]);
  });

  it("a stale dependency is no relation", () => {
    const relations = buildTaskRelations([task(1, { dependencies: [9] })]);

    expect(relations.waitsFor(1)).toEqual([]);
    expect(relations.waitersOf(9)).toEqual([]);
  });

  it("the tasks depending on a task wait for it in note order, not in the order given", () => {
    const relations = buildTaskRelations([
      task(3, { dependencies: [1] }),
      task(2, { dependencies: [1] }),
      task(1),
    ]);

    expect(relations.waitersOf(1).map((relation) => relation.waiting)).toEqual([
      2, 3,
    ]);
  });

  it("a dependency held twice is one relation", () => {
    const relations = buildTaskRelations([
      task(1),
      task(2, { dependencies: [1, 1] }),
    ]);

    expect(relations.waitsFor(2)).toEqual([
      { kind: "dependency", waiting: 2, waitingFor: 1 },
    ]);
  });
});

describe("task relations: subtasks and sequential order", () => {
  it("a parent task waits for each direct subtask in note order, not for deeper ones", () => {
    const relations = buildTaskRelations([
      task(1),
      task(3, { parent: 1 }),
      task(2, { parent: 1 }),
      task(4, { parent: 2 }),
    ]);

    expect(ids(relations.childrenOf(1))).toEqual([2, 3]);
    expect(relations.waitsFor(1)).toEqual([
      { kind: "subtask", waiting: 1, waitingFor: 2 },
      { kind: "subtask", waiting: 1, waitingFor: 3 },
    ]);
    expect(relations.parentOf(4)?.task.id).toBe(2);
  });

  it("a task whose parent task is not among them has none and is waited for by nothing", () => {
    const relations = buildTaskRelations([task(2, { parent: 9 })]);

    expect(relations.parentOf(2)).toBeUndefined();
    expect(relations.waitersOf(2)).toEqual([]);
    expect(relations.ancestorsOf(2)).toEqual([]);
  });

  it("under a sequential parent each subtask waits for the one just before only", () => {
    const relations = buildTaskRelations([
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
      task(4, { parent: 1 }),
    ]);

    expect(relations.waitsFor(4)).toEqual([
      { kind: "sequential", waiting: 4, waitingFor: 3 },
    ]);
    expect(relations.waitersOf(2)).toEqual([
      { kind: "subtask", waiting: 1, waitingFor: 2 },
      { kind: "sequential", waiting: 3, waitingFor: 2 },
    ]);
  });

  it("siblings follow note order whether or not the parent is sequential, and make no relation when it is not", () => {
    const relations = buildTaskRelations([
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 1 }),
    ]);

    expect(relations.nextSiblingOf(2)?.task.id).toBe(3);
    expect(relations.waitsFor(3)).toEqual([]);
  });

  it("the waiters of a task list its parent task, then the subtask after it, then the tasks depending on it", () => {
    const relations = buildTaskRelations([
      task(1, { sequential: true }),
      task(2, { parent: 1 }),
      task(3, { parent: 1, dependencies: [2] }),
      task(4, { dependencies: [2] }),
    ]);

    expect(relations.waitersOf(2)).toEqual([
      { kind: "subtask", waiting: 1, waitingFor: 2 },
      { kind: "sequential", waiting: 3, waitingFor: 2 },
      { kind: "dependency", waiting: 3, waitingFor: 2 },
      { kind: "dependency", waiting: 4, waitingFor: 2 },
    ]);
  });
});

describe("task relations: ancestors and lookup", () => {
  it("the ancestor tasks come nearest first", () => {
    const relations = buildTaskRelations([
      task(1),
      task(2, { parent: 1 }),
      task(3, { parent: 2 }),
    ]);

    expect(ids(relations.ancestorsOf(3))).toEqual([2, 1]);
  });

  it("a parent chain that loops back is cut where it does", () => {
    const relations = buildTaskRelations([
      task(1, { parent: 2 }),
      task(2, { parent: 1 }),
    ]);

    expect(ids(relations.ancestorsOf(1))).toEqual([2]);
  });

  it("every task comes in note order, and each by its ID", () => {
    const relations = buildTaskRelations([
      task(2, { position: 5 }),
      task(1, { position: 7 }),
    ]);

    expect(ids(relations.tasks)).toEqual([2, 1]);
    expect(relations.get(1)?.position).toBe(7);
    expect(relations.get(9)).toBeUndefined();
  });
});
