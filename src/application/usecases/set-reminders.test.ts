import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { RemindersUnreadableError } from "./reminders-unreadable-error";
import { createSetReminders, PastReminderError } from "./set-reminders";

const at = (local: string) => new Date(`${local}+08:00`);

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  clock: createFixedClock("2026-10-12T10:00:00+08:00"),
});

describe("set a task's reminders", () => {
  it("writes the reminders in order, each once, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    await createSetReminders(deps(repository))(1, [
      at("2026-10-20T09:00:00"),
      at("2026-10-13T09:00:00"),
      at("2026-10-20T09:00:00"),
    ]);
    expect((await repository.getTask(1))?.reminders).toEqual({
      kind: "list",
      reminders: [at("2026-10-13T09:00:00"), at("2026-10-20T09:00:00")],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("keeps a reminder the task already had though it has passed, and clears them all", async () => {
    const repository = createInMemoryTaskRepository();
    const passed = at("2026-10-10T09:00:00");
    repository.addTask({
      id: 1,
      status: "todo",
      reminders: { kind: "list", reminders: [passed] },
    });
    const setReminders = createSetReminders(deps(repository));
    await setReminders(1, [passed, at("2026-10-13T09:00:00")]);
    expect((await repository.getTask(1))?.reminders).toEqual({
      kind: "list",
      reminders: [passed, at("2026-10-13T09:00:00")],
    });
    await setReminders(1, []);
    expect((await repository.getTask(1))?.reminders).toEqual({
      kind: "list",
      reminders: [],
    });
  });

  it("refuses a newly added moment not later than now, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    await expect(
      createSetReminders(deps(repository))(1, [
        at("2026-10-13T09:00:00"),
        at("2026-10-12T10:00:00"),
      ]),
    ).rejects.toEqual(new PastReminderError([at("2026-10-12T10:00:00")]));
    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(1))?.reminders).toEqual({ kind: "none" });
  });

  it("refuses reminders it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      reminders: { kind: "unreadable", reason: "unknown version 2" },
    });
    await expect(
      createSetReminders(deps(repository))(1, [at("2026-10-13T09:00:00")]),
    ).rejects.toEqual(new RemindersUnreadableError("unknown version 2"));
    expect(repository.writeCount()).toBe(0);
  });
});
