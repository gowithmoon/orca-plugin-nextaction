import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createChangeStatus } from "./change-status";
import { createSetRecurrence } from "./set-recurrence";

const everyTwoWeeks = {
  period: { interval: 2, unit: "week" },
  basis: "schedule",
} as const;

describe("set recurrence", () => {
  it("writes the rule in one write, leaving the task's dates as they are", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 16 };
    const start = { year: 2026, month: 10, day: 13 };
    repository.addTask({ id: 1, status: "todo", start, due });
    const setRecurrence = createSetRecurrence({ repository });

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
    const setRecurrence = createSetRecurrence({ repository });
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

  it("refuses to overwrite a rule it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "unreadable", reason: "unknown version 2" } as const;
    repository.addTask({ id: 3, recurrence: stored });
    const setRecurrence = createSetRecurrence({ repository });

    await expect(setRecurrence(3, everyTwoWeeks)).rejects.toThrow();
    expect((await repository.getTask(3))?.recurrence).toEqual(stored);
    expect(repository.writeCount()).toBe(0);
  });
});
