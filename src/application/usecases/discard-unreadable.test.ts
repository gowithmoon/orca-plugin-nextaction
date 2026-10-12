import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createDiscardUnreadable } from "./discard-unreadable";

const unreadable = { kind: "unreadable", reason: "unknown version 2" } as const;

describe("discard data this plugin cannot read", () => {
  it("writes no recurrence rule over one it cannot read, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo", recurrence: unreadable });
    await createDiscardUnreadable({ repository })(1, "recurrence");
    expect((await repository.getTask(1))?.recurrence).toEqual({ kind: "none" });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes an empty review plan over one it cannot read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo", review: unreadable });
    await createDiscardUnreadable({ repository })(1, "review");
    expect((await repository.getTask(1))?.review).toEqual({
      kind: "plan",
      plan: { interval: null, lastReviewed: null, reviewOn: null },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes an empty list over reminders it cannot read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo", reminders: unreadable });
    await createDiscardUnreadable({ repository })(1, "reminders");
    expect((await repository.getTask(1))?.reminders).toEqual({
      kind: "list",
      reminders: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing over data it can read", async () => {
    const repository = createInMemoryTaskRepository();
    const reminders = {
      kind: "list",
      reminders: [new Date("2026-10-13T01:00:00.000Z")],
    } as const;
    repository.addTask({ id: 1, status: "todo", reminders });
    await createDiscardUnreadable({ repository })(1, "reminders");
    expect((await repository.getTask(1))?.reminders).toEqual(reminders);
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing to a task without the data", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    await createDiscardUnreadable({ repository })(1, "recurrence");
    expect((await repository.getTask(1))?.recurrence).toEqual({ kind: "none" });
    expect(repository.writeCount()).toBe(0);
  });

  it("fails, writing nothing, when the block is not a task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(1);
    await expect(
      createDiscardUnreadable({ repository })(1, "review"),
    ).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });
});
