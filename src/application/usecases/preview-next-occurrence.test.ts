import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createPreviewNextOccurrence } from "./preview-next-occurrence";

// Thursday October 8, 2026, 9:00 in UTC+8: the logical day is October 8.
const deps = () => ({
  clock: createFixedClock("2026-10-08T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

const everyMonWedFri = {
  interval: 1,
  unit: "week",
  placement: { kind: "daysOfWeek", days: [1, 3, 5] },
} as const;

describe("preview next occurrence", () => {
  it("on a fixed schedule, counts from the task's due date", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      // Monday October 12.
      due: { year: 2026, month: 10, day: 12 },
    });
    const task = await repository.getTask(1);
    if (!task) throw new Error("no task");
    const preview = createPreviewNextOccurrence(deps());

    expect(
      preview({ period: everyMonWedFri, basis: "schedule" }, task),
    ).toEqual({ year: 2026, month: 10, day: 14 });
    // A preview, nothing written.
    expect(repository.writeCount()).toBe(0);
  });

  it("after completion, counts from today, whatever the task's dates", () => {
    const preview = createPreviewNextOccurrence(deps());

    expect(
      preview(
        { period: everyMonWedFri, basis: "completion" },
        { start: null, due: { year: 2026, month: 9, day: 1 } },
      ),
    ).toEqual({ year: 2026, month: 10, day: 9 });
  });

  it("on a fixed schedule without dates, counts from today", () => {
    const preview = createPreviewNextOccurrence(deps());

    expect(
      preview(
        { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
        { start: null, due: null },
      ),
    ).toEqual({ year: 2026, month: 10, day: 9 });
  });
});
