import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { createChangeStatus } from "./change-status";
import { createSetRecurrence } from "./set-recurrence";

const everyTwoWeeks = {
  period: { interval: 2, unit: "week" },
  basis: "schedule",
} as const;

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Thursday October 8, 2026.
  clock: createFixedClock("2026-10-08T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("set recurrence", () => {
  it("writes the rule in one write, leaving the task's dates as they are", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 16 };
    const start = { year: 2026, month: 10, day: 13 };
    repository.addTask({ id: 1, status: "todo", start, due });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, everyTwoWeeks);

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "todo",
      start,
      due,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("after the rule is removed, completing the task leaves it done", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 16 };
    repository.addTask({
      id: 2,
      status: "todo",
      due,
      recurrence: { kind: "rule", rule: everyTwoWeeks },
    });
    const setRecurrence = createSetRecurrence(deps(repository));
    const changeStatus = createChangeStatus({
      repository,
      clock: createFixedClock("2026-10-08T09:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    await setRecurrence(2, null);
    expect(await changeStatus(2, "done")).toEqual({ kind: "changed" });

    expect(await repository.getTask(2)).toMatchObject({
      recurrence: { kind: "none" },
      status: "done",
      due,
    });
  });

  it("resuming the rule of a done task advances it in the same write, recording nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const completed = {
      at: new Date("2026-10-01T01:00:00.000Z"),
      day: { year: 2026, month: 10, day: 1 },
    };
    repository.addTask(
      {
        id: 4,
        status: "done",
        due: { year: 2026, month: 10, day: 2 },
        recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
      },
      { completionHistory: { kind: "readable", history: [completed] } },
    );
    const setRecurrence = createSetRecurrence({
      repository,
      clock: createFixedClock("2026-10-08T09:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(await setRecurrence(4, everyTwoWeeks)).toEqual({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 16 },
      resumedOn: { year: 2026, month: 10, day: 8 },
    });

    expect(await repository.getTask(4)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "todo",
      due: { year: 2026, month: 10, day: 16 },
    });
    expect(await repository.readCompletionHistory(4)).toEqual({
      kind: "readable",
      history: [completed],
    });
    // Rule, status and date in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task uses up one of the remaining occurrences, in the same write (#89)", async () => {
    const repository = createInMemoryTaskRepository();
    const counted = {
      ...everyTwoWeeks,
      end: { kind: "count", total: 5, remaining: 3 },
    } as const;
    repository.addTask({
      id: 14,
      status: "done",
      due: { year: 2026, month: 10, day: 2 },
      recurrence: { kind: "rule", rule: { ...counted, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(14, counted)).toMatchObject({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 16 },
    });

    expect(await repository.getTask(14)).toMatchObject({
      status: "todo",
      recurrence: {
        kind: "rule",
        rule: { ...counted, end: { kind: "count", total: 5, remaining: 2 } },
      },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task on its last occurrence ends the recurrence: done, the rule removed (#89)", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    const lastOne = {
      ...everyTwoWeeks,
      end: { kind: "count", total: 5, remaining: 1 },
    } as const;
    repository.addTask({
      id: 15,
      status: "done",
      due,
      recurrence: { kind: "rule", rule: { ...lastOne, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(15, lastOne)).toEqual({ kind: "ended" });

    expect(await repository.getTask(15)).toMatchObject({
      status: "done",
      due,
      recurrence: { kind: "none" },
    });
    expect(await repository.readCompletionHistory(15)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a task not done writes only the rule", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    repository.addTask({
      id: 5,
      status: "doing",
      due,
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(5, everyTwoWeeks)).toEqual({ kind: "set" });

    expect(await repository.getTask(5)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "doing",
      due,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task resets its done descendant tasks in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 6,
      status: "done",
      due: { year: 2026, month: 10, day: 2 },
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
    });
    repository.addTask(
      { id: 7, status: "done", due: { year: 2026, month: 10, day: 1 } },
      { parentId: 6 },
    );
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(6, everyTwoWeeks);

    // Moved by the fourteen days the task moved.
    expect(await repository.getTask(7)).toMatchObject({
      status: "todo",
      due: { year: 2026, month: 10, day: 15 },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("pausing the rule of a done task writes only the rule", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    repository.addTask({
      id: 8,
      status: "done",
      due,
      recurrence: { kind: "rule", rule: everyTwoWeeks },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(8, { ...everyTwoWeeks, paused: true })).toEqual({
      kind: "set",
    });

    expect(await repository.getTask(8)).toMatchObject({
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
      status: "done",
      due,
    });
  });

  it("refuses to overwrite a rule it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "unreadable", reason: "unknown version 2" } as const;
    repository.addTask({ id: 3, recurrence: stored });
    const setRecurrence = createSetRecurrence(deps(repository));

    await expect(setRecurrence(3, everyTwoWeeks)).rejects.toThrow();
    expect((await repository.getTask(3))?.recurrence).toEqual(stored);
    expect(repository.writeCount()).toBe(0);
  });
});
