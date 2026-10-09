import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createDropTask } from "./drop-task";

const completion = {
  at: new Date("2026-10-01T01:00:00.000Z"),
  day: { year: 2026, month: 10, day: 1 },
};

describe("drop task", () => {
  it("makes the block a plain block and discards its completion history", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 30, status: "doing" },
      { completionHistory: { kind: "readable", history: [completion] } },
    );
    repository.addTask(
      { id: 35, status: "done" },
      {
        completionHistory: { kind: "unreadable", reason: "unknown version 9" },
      },
    );
    const dropTask = createDropTask({ repository });

    await dropTask(30);
    await dropTask(35);

    expect(await repository.getTask(30)).toBeNull();
    expect(repository.writeCount()).toBe(2);
    // Converted again, it starts blank: nothing came back from before.
    for (const id of [30, 35]) {
      await repository.convertToTask(id);
      expect((await repository.getTask(id))?.status).toBe("inbox");
      expect(await repository.readCompletionHistory(id)).toEqual({
        kind: "readable",
        history: [],
      });
    }
  });

  it("leaves its subtasks as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 31, status: "todo" });
    repository.addTask({ id: 32, status: "doing" }, { parentId: 31 });
    const dropTask = createDropTask({ repository });

    await dropTask(31);

    expect((await repository.getTask(32))?.status).toBe("doing");
  });

  it("clears the dependency of a task that depended on it, keeping its others", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 40, status: "todo" });
    repository.addTask({ id: 41, status: "todo" });
    repository.addTask({ id: 42, status: "todo", dependencies: [41, 40] });
    const dropTask = createDropTask({ repository });

    await dropTask(40);

    expect((await repository.getTask(42))?.dependencies).toEqual([41]);
    // All of it is one write: one undo restores the task and the dependency.
    expect(repository.writeCount()).toBe(1);
  });

  it("clears it from every task that depended on it, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 50, status: "todo" });
    repository.addTask({ id: 51, status: "todo" });
    repository.addTask({ id: 52, status: "todo", dependencies: [50] });
    repository.addTask({ id: 53, status: "doing", dependencies: [50, 51] });
    repository.addTask({ id: 54, status: "todo", dependencies: [51] });
    const dropTask = createDropTask({ repository });

    await dropTask(50);

    expect((await repository.getTask(52))?.dependencies).toEqual([]);
    expect((await repository.getTask(53))?.dependencies).toEqual([51]);
    expect((await repository.getTask(54))?.dependencies).toEqual([51]);
    expect(repository.writeCount()).toBe(1);
  });

  it("leaves other tasks' dependencies as they are when none was on it", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 60, status: "todo" });
    repository.addTask({ id: 61, status: "todo" });
    repository.addTask({ id: 62, status: "todo", dependencies: [61] });
    const dropTask = createDropTask({ repository });

    await dropTask(60);

    expect(await repository.getTask(60)).toBeNull();
    expect((await repository.getTask(62))?.dependencies).toEqual([61]);
    expect(repository.writeCount()).toBe(1);
  });

  it("throws when the write fails, leaving the task as it was", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 33, status: "todo" },
      { completionHistory: { kind: "readable", history: [completion] } },
    );
    const failure = new Error("Orca is gone");
    repository.failWrites(failure);
    const dropTask = createDropTask({ repository });

    await expect(dropTask(33)).rejects.toBe(failure);
    expect((await repository.getTask(33))?.status).toBe("todo");
    expect(await repository.readCompletionHistory(33)).toEqual({
      kind: "readable",
      history: [completion],
    });
  });

  it("fails on a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(34);
    const dropTask = createDropTask({ repository });

    await expect(dropTask(34)).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });
});
