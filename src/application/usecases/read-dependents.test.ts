import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadDependents } from "./read-dependents";

describe("read dependents", () => {
  it("lists the tasks that depend directly on the task, with their text and status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({
      id: 2,
      text: "Paint the wall",
      status: "todo",
      dependencies: [1],
    });
    repository.addTask({ id: 3, text: "Water the plants" });
    const readDependents = createReadDependents({ repository });

    expect(await readDependents(1)).toEqual([
      { id: 2, text: "Paint the wall", status: "todo" },
    ]);
  });

  it("leaves out dependents that are done, and keeps those that are someday", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({
      id: 2,
      text: "Paint the wall",
      status: "done",
      dependencies: [1],
    });
    repository.addTask({
      id: 3,
      text: "Paint the fence",
      status: "someday",
      dependencies: [1],
    });
    const readDependents = createReadDependents({ repository });

    expect(await readDependents(1)).toEqual([
      { id: 3, text: "Paint the fence", status: "someday" },
    ]);
  });

  it("leaves out the dependents' descendant tasks and the tasks depending on the dependents", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({ id: 2, text: "Paint the wall", dependencies: [1] });
    repository.addTask({ id: 3, text: "Tape the edges" }, { parentId: 2 });
    repository.addTask({ id: 4, text: "Hang the pictures", dependencies: [2] });
    const readDependents = createReadDependents({ repository });

    expect((await readDependents(1)).map((dependent) => dependent.id)).toEqual([
      2,
    ]);
  });

  it("lists the dependents in note order", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask(
      { id: 2, text: "Paint the fence", dependencies: [1] },
      { position: 30 },
    );
    repository.addTask(
      { id: 3, text: "Paint the wall", dependencies: [1] },
      { position: 10 },
    );
    repository.addTask(
      { id: 4, text: "Paint the door", dependencies: [1] },
      { position: 20 },
    );
    const readDependents = createReadDependents({ repository });

    expect((await readDependents(1)).map((dependent) => dependent.id)).toEqual([
      3, 4, 2,
    ]);
  });

  it("reads a mirror block's ID as its source task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({ id: 2, text: "Paint the wall", dependencies: [1] });
    repository.addMirror(50, 1);
    const readDependents = createReadDependents({ repository });

    expect(await readDependents(50)).toEqual([
      { id: 2, text: "Paint the wall", status: "inbox" },
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
    const readDependents = createReadDependents({ repository });

    expect((await readDependents(1)).map((dependent) => dependent.id)).toEqual([
      2,
    ]);
    // A block that is no longer a task has no dependents.
    expect(await readDependents(9)).toEqual([]);
  });

  it("returns none when no task depends on the task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Buy paint" });
    repository.addTask({ id: 2, text: "Paint the wall" });
    const readDependents = createReadDependents({ repository });

    expect(await readDependents(1)).toEqual([]);
  });
});
