import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import {
  createRepairNotAdvanced,
  NothingToAdvanceError,
} from "./repair-not-advanced";

describe("repair a recurring task not advanced: reminders (GLOSSARY: 提醒)", () => {
  it("moves the task's reminders with its dates, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 40,
      status: "done",
      start: { year: 2026, month: 10, day: 12 },
      recurrence: {
        kind: "rule",
        rule: {
          period: { interval: 1, unit: "week" },
          basis: "schedule",
        },
      },
      reminders: {
        kind: "list",
        reminders: [new Date("2026-10-12T08:00:00+08:00")],
      },
    });
    const advance = createRepairNotAdvanced({
      repository,
      clock: createFixedClock("2026-10-14T09:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    await advance(40);

    expect((await repository.getTask(40))?.reminders).toEqual({
      kind: "list",
      reminders: [new Date("2026-10-19T08:00:00+08:00")],
    });
    expect(repository.writeCount()).toBe(1);
  });
});

const weekly = {
  period: { interval: 1, unit: "week" },
  basis: "schedule",
} as const;

const earlier = {
  at: new Date("2026-10-01T01:00:00.000Z"),
  day: { year: 2026, month: 10, day: 1 },
};

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Wednesday October 14, 2026.
  clock: createFixedClock("2026-10-14T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("repair a recurring task not advanced: end conditions (#89)", () => {
  it("uses up one of the remaining occurrences, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 11,
      status: "done",
      due: { year: 2026, month: 10, day: 12 },
      recurrence: {
        kind: "rule",
        rule: { ...weekly, end: { kind: "count", total: 5, remaining: 3 } },
      },
    });
    const advance = createRepairNotAdvanced(deps(repository));

    expect(await advance(11)).toMatchObject({
      next: { year: 2026, month: 10, day: 19 },
    });

    expect((await repository.getTask(11))?.recurrence).toEqual({
      kind: "rule",
      rule: { ...weekly, end: { kind: "count", total: 5, remaining: 2 } },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("on the one remaining occurrence, ends the recurrence: the task stays done and the rule is removed", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 12 };
    repository.addTask({
      id: 12,
      status: "done",
      due,
      recurrence: {
        kind: "rule",
        rule: { ...weekly, end: { kind: "count", total: 5, remaining: 1 } },
      },
    });
    const advance = createRepairNotAdvanced(deps(repository));

    expect(await advance(12)).toEqual({ next: null });

    expect(await repository.getTask(12)).toMatchObject({
      status: "done",
      due,
      recurrence: { kind: "none" },
    });
    expect(await repository.readCompletionHistory(12)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(1);
  });
});

describe("repair a recurring task not advanced", () => {
  it("advances it in one write, recording no completion", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      {
        id: 1,
        status: "done",
        due: { year: 2026, month: 10, day: 12 },
        recurrence: { kind: "rule", rule: weekly },
      },
      { completionHistory: { kind: "readable", history: [earlier] } },
    );
    const advance = createRepairNotAdvanced(deps(repository));

    expect(await advance(1)).toEqual({
      next: { year: 2026, month: 10, day: 19 },
      repairedOn: { year: 2026, month: 10, day: 14 },
    });

    expect(await repository.getTask(1)).toMatchObject({
      status: "todo",
      due: { year: 2026, month: 10, day: 19 },
      recurrence: { kind: "rule", rule: weekly },
    });
    expect(await repository.readCompletionHistory(1)).toEqual({
      kind: "readable",
      history: [earlier],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("after completion, counts from the logical day it is repaired", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 2,
      status: "done",
      due: { year: 2026, month: 10, day: 1 },
      recurrence: {
        kind: "rule",
        rule: { period: { interval: 3, unit: "day" }, basis: "completion" },
      },
    });
    const advance = createRepairNotAdvanced(deps(repository));

    await advance(2);

    expect((await repository.getTask(2))?.due).toEqual({
      year: 2026,
      month: 10,
      day: 17,
    });
  });

  it.each([
    [
      "is not done",
      { status: "todo", recurrence: { kind: "rule", rule: weekly } },
    ],
    ["has no rule", { status: "done", recurrence: { kind: "none" } }],
    [
      "has a paused rule (#92)",
      {
        status: "done",
        recurrence: { kind: "rule", rule: { ...weekly, paused: true } },
      },
    ],
    [
      "has a rule it cannot read",
      {
        status: "done",
        recurrence: { kind: "unreadable", reason: "unknown version 2" },
      },
    ],
  ] as const)("refuses a task that %s, writing nothing", async (_, task) => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 3, ...task });
    const advance = createRepairNotAdvanced(deps(repository));

    await expect(advance(3)).rejects.toBeInstanceOf(NothingToAdvanceError);
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(4);
    const advance = createRepairNotAdvanced(deps(repository));

    await expect(advance(4)).rejects.toBeInstanceOf(NothingToAdvanceError);
    expect(repository.writeCount()).toBe(0);
  });
});

describe("repair a recurring task not advanced: its descendant tasks", () => {
  it("brings its done descendant tasks back to todo, their dates moved as far as the task's, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    // 每周大扫除 > 拖地 (done), 擦窗 (doing), and below a plain block 倒垃圾 (done).
    repository.addTask({
      id: 20,
      status: "done",
      due: { year: 2026, month: 10, day: 12 },
      recurrence: { kind: "rule", rule: weekly },
    });
    repository.addTask(
      { id: 21, status: "done", due: { year: 2026, month: 10, day: 11 } },
      { parentId: 20 },
    );
    repository.addTask({ id: 22, status: "doing" }, { parentId: 20 });
    repository.addBlock(23, { parentId: 20 });
    repository.addTask({ id: 24, status: "done" }, { parentId: 23 });
    const advance = createRepairNotAdvanced(deps(repository));

    await advance(20);

    expect(await repository.getTask(21)).toMatchObject({
      status: "todo",
      due: { year: 2026, month: 10, day: 18 },
    });
    expect((await repository.getTask(22))?.status).toBe("doing");
    expect((await repository.getTask(24))?.status).toBe("todo");
    // No completion is recorded for a descendant task.
    expect(await repository.readCompletionHistory(21)).toEqual({
      kind: "readable",
      history: [],
    });
    // The task and its descendant tasks in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it("leaves a done descendant task with a rule of its own as it is", async () => {
    const repository = createInMemoryTaskRepository();
    const ownDue = { year: 2026, month: 10, day: 11 };
    repository.addTask({
      id: 30,
      status: "done",
      due: { year: 2026, month: 10, day: 12 },
      recurrence: { kind: "rule", rule: weekly },
    });
    repository.addTask(
      {
        id: 31,
        status: "done",
        due: ownDue,
        recurrence: { kind: "rule", rule: { ...weekly, paused: true } },
      },
      { parentId: 30 },
    );
    const advance = createRepairNotAdvanced(deps(repository));

    await advance(30);

    expect(await repository.getTask(31)).toMatchObject({
      status: "done",
      due: ownDue,
    });
  });

  it("on the last occurrence, leaves its descendant tasks as they are, as completing does", async () => {
    const repository = createInMemoryTaskRepository();
    const childDue = { year: 2026, month: 10, day: 11 };
    repository.addTask({
      id: 40,
      status: "done",
      due: { year: 2026, month: 10, day: 12 },
      recurrence: {
        kind: "rule",
        rule: { ...weekly, end: { kind: "count", total: 5, remaining: 1 } },
      },
    });
    repository.addTask(
      { id: 41, status: "done", due: childDue },
      { parentId: 40 },
    );
    const advance = createRepairNotAdvanced(deps(repository));

    expect(await advance(40)).toEqual({ next: null });

    expect(await repository.getTask(41)).toMatchObject({
      status: "done",
      due: childDue,
    });
  });
});
