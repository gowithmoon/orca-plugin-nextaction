import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import {
  createAdvanceStuckDone,
  NotStuckDoneError,
} from "./advance-stuck-done";

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

describe("advance a recurring task stuck in done: end conditions (#89)", () => {
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
    const advance = createAdvanceStuckDone(deps(repository));

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
    const advance = createAdvanceStuckDone(deps(repository));

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

describe("advance a recurring task stuck in done", () => {
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
    const advance = createAdvanceStuckDone(deps(repository));

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
    const advance = createAdvanceStuckDone(deps(repository));

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
    const advance = createAdvanceStuckDone(deps(repository));

    await expect(advance(3)).rejects.toBeInstanceOf(NotStuckDoneError);
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(4);
    const advance = createAdvanceStuckDone(deps(repository));

    await expect(advance(4)).rejects.toBeInstanceOf(NotStuckDoneError);
    expect(repository.writeCount()).toBe(0);
  });
});
