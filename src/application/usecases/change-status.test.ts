import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { taskStatuses } from "../../domain/task/task";
import { createChangeStatus } from "./change-status";
import { CompletionHistoryUnreadableError } from "./completion-history-unreadable-error";
import { RecurrenceUnreadableError } from "./recurrence-unreadable-error";

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

  it("writes inbox to a task whose status is empty or unknown, repairing it", async () => {
    const repository = createInMemoryTaskRepository();
    // How the codec reads a status the notes do not hold as an option: it
    // reads as inbox, but the notes hold no inbox status yet.
    repository.addTask({
      id: 22,
      status: "inbox",
      anomalies: [{ property: "status", value: "Blocked" }],
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(22, "inbox")).toEqual({ kind: "changed" });
    expect(repository.writeCount()).toBe(1);
    const repaired = await repository.getTask(22);
    expect(repaired?.status).toBe("inbox");
    expect(repaired?.anomalies).toEqual([]);
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

describe("change status: recurring tasks", () => {
  const weekly = {
    kind: "rule",
    rule: { period: { interval: 1, unit: "week" }, basis: "schedule" },
  } as const;

  it("completing a recurring task advances it in one write and returns the next occurrence", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 60,
      status: "todo",
      due: { year: 2026, month: 10, day: 5 },
      recurrence: weekly,
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(60, "done")).toEqual({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 12 },
      completedOn: { year: 2026, month: 10, day: 8 },
    });

    const task = await repository.getTask(60);
    expect(task?.status).toBe("todo");
    expect(task?.due).toEqual({ year: 2026, month: 10, day: 12 });
    expect(await repository.readCompletionHistory(60)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
    // Status, date and history in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it("completing a recurring task in progress also goes back to todo", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 61,
      status: "doing",
      start: { year: 2026, month: 10, day: 8 },
      recurrence: weekly,
    });
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(61, "done");

    const task = await repository.getTask(61);
    expect(task?.status).toBe("todo");
    expect(task?.start).toEqual({ year: 2026, month: 10, day: 15 });
  });

  it("completing the last occurrence ends the recurrence: done, the rule removed, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 5 };
    repository.addTask({
      id: 64,
      status: "todo",
      due,
      recurrence: {
        kind: "rule",
        rule: {
          ...weekly.rule,
          end: { kind: "count", total: 3, remaining: 1 },
        },
      },
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(64, "done")).toEqual({ kind: "ended" });

    expect(await repository.getTask(64)).toMatchObject({
      status: "done",
      due,
      recurrence: { kind: "none" },
    });
    expect(await repository.readCompletionHistory(64)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("completing a recurring task with occurrences left uses one up, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 65,
      status: "todo",
      due: { year: 2026, month: 10, day: 5 },
      recurrence: {
        kind: "rule",
        rule: {
          ...weekly.rule,
          end: { kind: "count", total: 3, remaining: 3 },
        },
      },
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(65, "done")).toMatchObject({ kind: "advanced" });

    expect((await repository.getTask(65))?.recurrence).toEqual({
      kind: "rule",
      rule: { ...weekly.rule, end: { kind: "count", total: 3, remaining: 2 } },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("fails to complete a task whose rule is unreadable, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 62,
      status: "todo",
      recurrence: { kind: "unreadable", reason: "unknown version 2" },
    });
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(62, "done")).rejects.toBeInstanceOf(
      RecurrenceUnreadableError,
    );

    expect((await repository.getTask(62))?.status).toBe("todo");
    expect(await repository.readCompletionHistory(62)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("fails to complete a recurring task whose history is unreadable, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 5 };
    repository.addTask(
      { id: 63, status: "todo", due, recurrence: weekly },
      {
        completionHistory: { kind: "unreadable", reason: "unknown version 2" },
      },
    );
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(63, "done")).rejects.toBeInstanceOf(
      CompletionHistoryUnreadableError,
    );

    expect(await repository.getTask(63)).toMatchObject({ status: "todo", due });
    expect(repository.writeCount()).toBe(0);
  });

  it("completing a recurring task with a placement puts its date on the placement (#88)", async () => {
    const repository = createInMemoryTaskRepository();
    // Every month on the last Friday, after completion: done on Thursday
    // October 8, 2026, so next is Friday October 30.
    repository.addTask({
      id: 64,
      status: "todo",
      due: { year: 2026, month: 9, day: 25 },
      recurrence: {
        kind: "rule",
        rule: {
          period: {
            interval: 1,
            unit: "month",
            placement: {
              kind: "weekdaysOfMonth",
              weekdays: [{ ordinal: "last", weekday: 5 }],
            },
          },
          basis: "completion",
        },
      },
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(64, "done")).toMatchObject({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 30 },
    });
    expect((await repository.getTask(64))?.due).toEqual({
      year: 2026,
      month: 10,
      day: 30,
    });
  });
});

describe("change status: a paused rule (#92)", () => {
  it("completing a task whose rule is paused leaves it done like a plain task, recording the completion", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 5 };
    repository.addTask({
      id: 70,
      status: "todo",
      due,
      recurrence: {
        kind: "rule",
        rule: {
          period: { interval: 1, unit: "week" },
          basis: "schedule",
          paused: true,
        },
      },
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(70, "done")).toEqual({ kind: "changed" });

    expect(await repository.getTask(70)).toMatchObject({ status: "done", due });
    expect(await repository.readCompletionHistory(70)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
    expect(repository.writeCount()).toBe(1);
  });
});

describe("change status: the descendant tasks of a recurring task", () => {
  const weekly = {
    kind: "rule",
    rule: { period: { interval: 1, unit: "week" }, basis: "schedule" },
  } as const;
  const due = { year: 2026, month: 10, day: 5 };

  it("completing a recurring task brings its done descendant tasks back to todo in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    // 每周大扫除 > 拖地 (done), 擦窗 (doing), and below a plain block 倒垃圾 (done).
    repository.addTask({ id: 70, status: "todo", due, recurrence: weekly });
    repository.addTask(
      { id: 71, status: "done", due: { year: 2026, month: 10, day: 4 } },
      { parentId: 70 },
    );
    repository.addTask({ id: 72, status: "doing" }, { parentId: 70 });
    repository.addBlock(73, { parentId: 70 });
    repository.addTask({ id: 74, status: "done" }, { parentId: 73 });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(70, "done")).toMatchObject({ kind: "advanced" });

    expect(await repository.getTask(71)).toMatchObject({
      status: "todo",
      due: { year: 2026, month: 10, day: 11 },
    });
    expect((await repository.getTask(72))?.status).toBe("doing");
    expect((await repository.getTask(74))?.status).toBe("todo");
    // No completion is recorded for a descendant task brought back to todo.
    expect(await repository.readCompletionHistory(71)).toEqual({
      kind: "readable",
      history: [],
    });
    // The task and its descendant tasks in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it("fails to complete a recurring task when a done descendant task's rule cannot be read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 75, status: "todo", due, recurrence: weekly });
    repository.addTask({ id: 76, status: "done" }, { parentId: 75 });
    repository.addTask(
      {
        id: 77,
        status: "done",
        recurrence: { kind: "unreadable", reason: "unknown version 2" },
      },
      { parentId: 75 },
    );
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(75, "done")).rejects.toBeInstanceOf(
      RecurrenceUnreadableError,
    );

    expect(await repository.getTask(75)).toMatchObject({ status: "todo", due });
    expect((await repository.getTask(76))?.status).toBe("done");
    expect(repository.writeCount()).toBe(0);
  });

  it("fails to complete a recurring task when a descendant task's write fails, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 78, status: "todo", due, recurrence: weekly });
    repository.addTask({ id: 79, status: "done" }, { parentId: 78 });
    repository.failWrites(new Error("plugin block property unreadable"));
    const changeStatus = createChangeStatus(deps(repository));

    await expect(changeStatus(78, "done")).rejects.toThrow();

    expect(await repository.getTask(78)).toMatchObject({ status: "todo", due });
    expect((await repository.getTask(79))?.status).toBe("done");
  });
});

describe("change status: reminders (GLOSSARY: 提醒)", () => {
  const reminders = (...moments: string[]) =>
    ({
      kind: "list",
      reminders: moments.map((moment) => new Date(moment)),
    }) as const;

  it("completing a task clears its reminders, in the same write as the completion", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 90,
      status: "todo",
      reminders: reminders("2026-10-09T09:00:00+08:00"),
    });
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(90, "done");

    expect((await repository.getTask(90))?.reminders).toEqual(reminders());
    expect(await repository.readCompletionHistory(90)).toEqual({
      kind: "readable",
      history: [nineOClockOct8],
    });
    expect(repository.writeCount()).toBe(1);
  });

  const weekly = {
    period: { interval: 1, unit: "week" },
    basis: "schedule",
  } as const;

  it("completing a task whose rule is paused clears its reminders", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 92,
      status: "todo",
      due: { year: 2026, month: 10, day: 5 },
      recurrence: { kind: "rule", rule: { ...weekly, paused: true } },
      reminders: reminders("2026-10-05T09:00:00+08:00"),
    });
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(92, "done");

    expect((await repository.getTask(92))?.reminders).toEqual(reminders());
  });

  it("completing the last occurrence clears the reminders, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 93,
      status: "todo",
      due: { year: 2026, month: 10, day: 5 },
      recurrence: {
        kind: "rule",
        rule: { ...weekly, end: { kind: "count", total: 3, remaining: 1 } },
      },
      reminders: reminders("2026-10-05T09:00:00+08:00"),
    });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(93, "done")).toEqual({ kind: "ended" });

    expect((await repository.getTask(93))?.reminders).toEqual(reminders());
    expect(repository.writeCount()).toBe(1);
  });

  it("completing a recurring task moves its reminders with its dates, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 94,
      status: "todo",
      due: { year: 2026, month: 10, day: 5 },
      recurrence: { kind: "rule", rule: weekly },
      reminders: reminders(
        "2026-10-02T09:00:00+08:00",
        "2026-10-05T18:30:00+08:00",
      ),
    });
    const changeStatus = createChangeStatus(deps(repository));

    await changeStatus(94, "done");

    expect((await repository.getTask(94))?.reminders).toEqual(
      reminders("2026-10-09T09:00:00+08:00", "2026-10-12T18:30:00+08:00"),
    );
    expect(repository.writeCount()).toBe(1);
  });

  it("completing a task whose reminders cannot be read completes it, the reminders kept as they are", async () => {
    const repository = createInMemoryTaskRepository();
    const unreadable = { kind: "unreadable", reason: "unknown version 2" };
    repository.addTask({ id: 91, status: "todo", reminders: unreadable });
    const changeStatus = createChangeStatus(deps(repository));

    expect(await changeStatus(91, "done")).toEqual({ kind: "changed" });

    expect(await repository.getTask(91)).toMatchObject({
      status: "done",
      reminders: unreadable,
    });
  });
});
