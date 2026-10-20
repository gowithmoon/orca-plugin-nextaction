import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadWaiters } from "./read-waiters";

describe("read waiters", () => {
  it("lists the parent task as a subtask waiter, with its text and status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house", status: "todo" });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(2)).toEqual([
      { id: 1, text: "Paint the house", status: "todo", kinds: ["subtask"] },
    ]);
  });

  it("lists every later subtask under a sequential parent, and no earlier one", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house", sequential: true });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Tape the edges" }, { parentId: 1 });
    repository.addTask({ id: 4, text: "Paint the walls" }, { parentId: 1 });
    repository.addTask({ id: 5, text: "Clean up" }, { parentId: 1 });
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(3)).toEqual([
      { id: 1, text: "Paint the house", status: "inbox", kinds: ["subtask"] },
      {
        id: 4,
        text: "Paint the walls",
        status: "inbox",
        kinds: ["sequential"],
      },
      { id: 5, text: "Clean up", status: "inbox", kinds: ["sequential"] },
    ]);
  });

  it("lists no sibling when the parent task is not sequential", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house" });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Paint the walls" }, { parentId: 1 });
    const readWaiters = createReadWaiters({ repository });

    expect((await readWaiters(2)).map((waiter) => waiter.id)).toEqual([1]);
  });

  it("lists the tasks depending on it as dependency waiters", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({
      id: 2,
      text: "Paint the wall",
      status: "todo",
      dependencies: [1],
    });
    repository.addTask({ id: 3, text: "Water the plants" });
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(1)).toEqual([
      { id: 2, text: "Paint the wall", status: "todo", kinds: ["dependency"] },
    ]);
  });

  it("lists a task waiting in two ways once, with both kinds, in the group it comes first", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house", sequential: true });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    repository.addTask(
      { id: 3, text: "Paint the walls", dependencies: [2] },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 4, text: "Clean up", dependencies: [2] },
      { parentId: 1 },
    );
    repository.addTask({ id: 5, text: "Hang the pictures", dependencies: [2] });
    const readWaiters = createReadWaiters({ repository });

    expect(
      (await readWaiters(2)).map((waiter) => [waiter.id, waiter.kinds]),
    ).toEqual([
      [1, ["subtask"]],
      [3, ["sequential", "dependency"]],
      [4, ["sequential", "dependency"]],
      [5, ["dependency"]],
    ]);
  });

  it("leaves out waiters that are done, and keeps those that are someday", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house", status: "done" });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    repository.addTask({
      id: 3,
      text: "Paint the wall",
      status: "done",
      dependencies: [2],
    });
    repository.addTask({
      id: 4,
      text: "Paint the fence",
      status: "someday",
      dependencies: [2],
    });
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(2)).toEqual([
      {
        id: 4,
        text: "Paint the fence",
        status: "someday",
        kinds: ["dependency"],
      },
    ]);
  });

  it.each(["someday", "done"] as const)(
    "lists the waiters as usual when the task itself is %s",
    async (status) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 1, text: "Paint the house", sequential: true });
      repository.addTask({ id: 2, text: "Buy paint", status }, { parentId: 1 });
      repository.addTask({ id: 3, text: "Paint the walls" }, { parentId: 1 });
      repository.addTask({
        id: 4,
        text: "Hang the pictures",
        dependencies: [2],
      });
      const readWaiters = createReadWaiters({ repository });

      expect(
        (await readWaiters(2)).map((waiter) => [waiter.id, waiter.kinds]),
      ).toEqual([
        [1, ["subtask"]],
        [3, ["sequential"]],
        [4, ["dependency"]],
      ]);
    },
  );

  it("reads a mirror block's ID as its source task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Paint the house" });
    repository.addTask({ id: 2, text: "Buy paint" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Paint the wall", dependencies: [2] });
    repository.addMirror(50, 2);
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(50)).toEqual([
      { id: 1, text: "Paint the house", status: "inbox", kinds: ["subtask"] },
      { id: 3, text: "Paint the wall", status: "inbox", kinds: ["dependency"] },
    ]);
  });

  it("leaves out ancestor tasks above the parent, descendant tasks, and the tasks waiting for the waiters", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Renovate" });
    repository.addTask(
      { id: 2, text: "Paint the house", sequential: true },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, text: "Buy paint" }, { parentId: 2 });
    repository.addTask({ id: 4, text: "Pick colours" }, { parentId: 3 });
    repository.addTask({ id: 5, text: "Paint the walls" }, { parentId: 2 });
    repository.addTask({ id: 6, text: "Prime the walls" }, { parentId: 5 });
    repository.addTask({ id: 7, text: "Paint the fence", dependencies: [3] });
    repository.addTask({ id: 8, text: "Fix the gate", dependencies: [7] });
    repository.addTask({ id: 9, text: "Clean the brushes", dependencies: [2] });
    const readWaiters = createReadWaiters({ repository });

    expect((await readWaiters(3)).map((waiter) => waiter.id)).toEqual([
      2, 5, 7,
    ]);
  });

  it("lists the parent, then the later subtasks, then the dependents, each group in note order", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 10, text: "Hang the pictures", dependencies: [2] },
      { position: 1 },
    );
    repository.addTask(
      { id: 1, text: "Paint the house", sequential: true },
      { position: 2 },
    );
    repository.addTask(
      { id: 2, text: "Buy paint" },
      { parentId: 1, position: 3 },
    );
    repository.addTask(
      { id: 4, text: "Clean up" },
      { parentId: 1, position: 5 },
    );
    repository.addTask(
      { id: 3, text: "Paint the walls" },
      { parentId: 1, position: 4 },
    );
    repository.addTask(
      { id: 12, text: "Paint the door", dependencies: [2] },
      { position: 8 },
    );
    repository.addTask(
      { id: 11, text: "Paint the fence", dependencies: [2] },
      { position: 7 },
    );
    const readWaiters = createReadWaiters({ repository });

    expect((await readWaiters(2)).map((waiter) => waiter.id)).toEqual([
      1, 3, 4, 10, 11, 12,
    ]);
  });

  it("is not thrown off by stale dependencies", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addBlock(9, { text: "No longer a task" });
    repository.addTask({
      id: 2,
      text: "Paint the wall",
      dependencies: [9, 1],
    });
    const readWaiters = createReadWaiters({ repository });

    expect((await readWaiters(1)).map((waiter) => waiter.id)).toEqual([2]);
    // A block that is no longer a task blocks nothing.
    expect(await readWaiters(9)).toEqual([]);
  });

  it("returns none when nothing waits for the task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({ id: 2, text: "Paint the wall" });
    const readWaiters = createReadWaiters({ repository });

    expect(await readWaiters(1)).toEqual([]);
  });
});
