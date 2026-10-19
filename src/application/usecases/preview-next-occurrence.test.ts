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
    ).toEqual({
      from: { date: "due", day: { year: 2026, month: 10, day: 12 } },
      next: { year: 2026, month: 10, day: 14 },
      last: false,
      overlaps: false,
    });
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
    ).toMatchObject({
      from: { date: "event", day: { year: 2026, month: 10, day: 8 } },
      next: { year: 2026, month: 10, day: 9 },
    });
  });

  it("on a fixed schedule without dates, counts from today", () => {
    const preview = createPreviewNextOccurrence(deps());

    expect(
      preview(
        { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
        { start: null, due: null },
      ),
    ).toMatchObject({
      from: { date: "event", day: { year: 2026, month: 10, day: 8 } },
      next: { year: 2026, month: 10, day: 9 },
    });
  });

  it("on a fixed schedule with only a start date, counts from it", () => {
    const preview = createPreviewNextOccurrence(deps());

    expect(
      preview(
        { period: everyMonWedFri, basis: "schedule" },
        { start: { year: 2026, month: 10, day: 12 }, due: null },
      ),
    ).toMatchObject({
      from: { date: "start", day: { year: 2026, month: 10, day: 12 } },
      next: { year: 2026, month: 10, day: 14 },
    });
  });

  it("tells the last occurrence counted from a due date past the end day, the start being today", () => {
    const preview = createPreviewNextOccurrence(deps());

    // Started today, due Friday November 13; every Monday, Wednesday and
    // Friday until Sunday November 15: the next one, Monday November 16, is
    // after the end day, and the dates overlap each occurrence.
    expect(
      preview(
        {
          period: everyMonWedFri,
          basis: "schedule",
          end: { kind: "until", day: { year: 2026, month: 11, day: 15 } },
        },
        {
          start: { year: 2026, month: 10, day: 8 },
          due: { year: 2026, month: 11, day: 13 },
        },
      ),
    ).toEqual({
      from: { date: "due", day: { year: 2026, month: 11, day: 13 } },
      next: { year: 2026, month: 11, day: 16 },
      last: true,
      overlaps: true,
    });
  });

  it("is the last when completing today would be the last occurrence (#89)", () => {
    const preview = createPreviewNextOccurrence(deps());
    const weekly = { interval: 1, unit: "week" } as const;
    const dueMonday = { start: null, due: { year: 2026, month: 10, day: 12 } };

    expect(
      preview(
        {
          period: weekly,
          basis: "schedule",
          end: { kind: "count", total: 3, remaining: 1 },
        },
        dueMonday,
      ).last,
    ).toBe(true);
    // The next occurrence, October 19, is after the end day.
    expect(
      preview(
        {
          period: weekly,
          basis: "schedule",
          end: { kind: "until", day: { year: 2026, month: 10, day: 18 } },
        },
        dueMonday,
      ),
    ).toMatchObject({ next: { year: 2026, month: 10, day: 19 }, last: true });
  });
});
