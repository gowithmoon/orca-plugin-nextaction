import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { taskStatuses } from "../../domain/task/task";
import {
  CompletionHistoryUnreadableError,
  createChangeStatus,
} from "./change-status";

/** The completion recorded at the clock of `deps`. */
const nineOClockOct8 = {
  at: new Date("2026-10-08T01:00:00.000Z"),
  day: { year: 2026, month: 10, day: 8 },
};

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  clock: createFixedClock("2026-10-08T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("change status", () => {
  it("writes the chosen status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 20, status: "todo" });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(20, "doing")).toEqual({ kind: "changed" });
    expect((await repository.getTask(20))?.status).toBe("doing");
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing when the task already is in the chosen status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 21, status: "waiting" });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(21, "waiting")).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("treats a task with an empty or unknown status as inbox", async () => {
    const repository = createInMemoryTaskRepository();
    // How the codec reads a status the notes do not hold as an option.
    repository.addTask({
      id: 22,
      status: "inbox",
      anomalies: [{ property: "status", value: "Blocked" }],
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(22, "inbox")).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes the chosen status to a task with an unknown status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 23,
      status: "inbox",
      anomalies: [{ property: "status", value: null }],
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(23, "todo")).toEqual({ kind: "changed" });
    expect((await repository.getTask(23))?.status).toBe("todo");
  });

  it("throws when the write fails (e.g. the status property is invalidated), changing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 24, status: "doing" });
    const failure = new Error("the status property is invalidated");
    repository.failWrites(failure);
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(24, "done")).rejects.toBe(failure);
    expect((await repository.getTask(24))?.status).toBe("doing");
  });
});

describe("change status: completion history", () => {
  it("records a completion, at the clock's time in that logical day, when a task enters done", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 40, status: "todo" });
    const changeStatus = createChangeStatus({
      repository,
      clock: createFixedClock("2026-10-08T09:15:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    await changeStatus(40, "done");

    expect((await repository.getTask(40))?.status).toBe("done");
    expect(await repository.readCompletionHistory(40)).toEqual({
      kind: "readable",
      history: [
        {
          at: new Date("2026-10-08T01:15:00.000Z"),
          day: { year: 2026, month: 10, day: 8 },
        },
      ],
    });
    // Status and history in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it.each(taskStatuses.filter((s) => s !== "done"))(
    "records a completion when a %s task enters done",
    async (from) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 41, status: from });
      const changeStatus = createChangeStatus(deps(repository));

      await changeStatus(41, "done");

      expect(await repository.readCompletionHistory(41)).toEqual({
        kind: "readable",
        history: [nineOClockOct8],
      });
    },
  );

  it("dates a completion before the day boundary to the previous logical day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 42, status: "doing" });
    const changeStatus = createChangeStatus({
      repository,
      clock: createFixedClock("2026-10-09T02:00:00+08:00"),
      dayBoundary: createFixedDayBoundary({ hours: 5, minutes: 0 }),
    });

    await changeStatus(42, "done");

    expect(await repository.readCompletionHistory(42)).toEqual({
      kind: "readable",
      history: [
        {
          at: new Date("2026-10-08T18:00:00.000Z"),
          day: { year: 2026, month: 10, day: 8 },
        },
      ],
    });
  });

  it("appends to the completions already recorded", async () => {
    const repository = createInMemoryTaskRepository();
    const earlier = {
      at: new Date("2026-10-01T01:00:00.000Z"),
      day: { year: 2026, month: 10, day: 1 },
    };
    repository.addTask(
      { id: 43, status: "todo" },
      { completionHistory: { kind: "readable", history: [earlier] } },
    );
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(43, "done");

    expect(await repository.readCompletionHistory(43)).toEqual({
      kind: "readable",
      history: [earlier, nineOClockOct8],
    });
  });

  it("records nothing more when a done task is set to done again", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 44, status: "todo" });
    const changeStatus = createChangeStatus(deps(repository));
    await changeStatus(44, "done");

    expect(await changeStatus(44, "done")).toEqual({ kind: "unchanged" });

    expect(await repository.readCompletionHistory(44)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("keeps the history when a task leaves done", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 45, status: "todo" });
    const changeStatus = createChangeStatus(deps(repository));
    await changeStatus(45, "done");

    await changeStatus(45, "todo");

    expect((await repository.getTask(45))?.status).toBe("todo");
    expect(await repository.readCompletionHistory(45)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
  });

  it("fails to set done, changing nothing, when the history is unreadable", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "unreadable", reason: "unknown version 2" } as const;
    repository.addTask(
      { id: 46, status: "doing" },
      { completionHistory: stored },
    );
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(46, "done")).rejects.toBeInstanceOf(
      CompletionHistoryUnreadableError,
    );

    expect((await repository.getTask(46))?.status).toBe("doing");
    expect(await repository.readCompletionHistory(46)).toEqual(stored);
    expect(repository.writeCount()).toBe(0);
  });

  it("still changes other statuses of a task whose history is unreadable", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "unreadable", reason: "unknown version 2" } as const;
    repository.addTask(
      { id: 47, status: "done" },
      { completionHistory: stored },
    );
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(47, "todo");

    expect((await repository.getTask(47))?.status).toBe("todo");
    expect(await repository.readCompletionHistory(47)).toEqual(stored);
  });
});
