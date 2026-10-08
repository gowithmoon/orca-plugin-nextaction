import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createEditTask } from "./edit-task";

describe("edit task", () => {
  it("writes only the properties passed, leaving the others as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 40,
      status: "todo",
      importance: 2,
      effort: 6,
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 10, day: 20 },
      contexts: ["@home"],
      labels: ["writing"],
      note: "old note",
    });
    const editTask = createEditTask({ repository });

    await editTask(40, { importance: 6, note: "call first" });

    expect(await repository.getTask(40)).toMatchObject({
      status: "todo",
      importance: 6,
      effort: 6,
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 10, day: 20 },
      contexts: ["@home"],
      labels: ["writing"],
      note: "call first",
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("clears the start and due dates", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 41,
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 10, day: 20 },
    });
    const editTask = createEditTask({ repository });

    await editTask(41, { start: null });
    await editTask(41, { due: null });

    expect(await repository.getTask(41)).toMatchObject({
      start: null,
      due: null,
    });
    expect(repository.writeCount()).toBe(2);
  });

  it("writes contexts and labels as they are, and clears them", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 44, contexts: ["@home"], labels: [] });
    const editTask = createEditTask({ repository });

    await editTask(44, { contexts: ["@home", "电话"], labels: ["写作"] });
    expect(await repository.getTask(44)).toMatchObject({
      contexts: ["@home", "电话"],
      labels: ["写作"],
    });

    await editTask(44, { contexts: [], labels: [] });
    expect(await repository.getTask(44)).toMatchObject({
      contexts: [],
      labels: [],
    });
    expect(repository.writeCount()).toBe(2);
  });

  it("fails on a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(42);
    const editTask = createEditTask({ repository });

    await expect(editTask(42, { importance: 7 })).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
    expect(await repository.getTask(42)).toBeNull();
  });

  it("throws the write's error as it is, leaving the task as it was", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 43, effort: 3, note: "keep" });
    const failure = new Error("Orca is gone");
    repository.failWrites(failure);
    const editTask = createEditTask({ repository });

    await expect(editTask(43, { effort: 5, note: null })).rejects.toBe(failure);
    expect(await repository.getTask(43)).toMatchObject({
      effort: 3,
      note: "keep",
    });
  });
});
