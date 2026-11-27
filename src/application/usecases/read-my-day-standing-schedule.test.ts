import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadMyDay } from "./read-my-day";

// Today's My Day with standing schedules (GLOSSARY: 常设排期; ADR 0029). In
// UTC+8 with the 5:00 boundary; Friday October 9, 2026 is a weekday.
const oct9 = { year: 2026, month: 10, day: 9 };
const at = (time: string) => new Date(`2026-10-${time}+08:00`);
const weekdays = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
} as const;
const standingSchedule = (start: string, end: string) => {
  const time = (text: string) => {
    const [hours, minutes] = text.split(":").map(Number) as [number, number];
    return { hours, minutes };
  };
  return {
    kind: "schedule",
    schedule: { start: time(start), end: time(end) },
  } as const;
};
const standup = standingSchedule("08:45", "09:15");

function setup(now = "2026-10-09T10:00:00+08:00") {
  const repository = createInMemoryTaskRepository();
  const dayBoundary = createFixedDayBoundary();
  const clock = createFixedClock(now);
  const readMyDay = createReadMyDay({
    repository,
    clock,
    dayBoundary,
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, clock, dayBoundary, readMyDay };
}

describe("read today's My Day with standing schedules", () => {
  it("brings in a recurring task due today at its standing schedule, writing nothing", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      standingSchedule: standup,
    });

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [[1, { start: at("09T08:45:00"), end: at("09T09:15:00") }]],
    );
    expect(read.all.map((item) => item.task.id)).toEqual([1]);
    expect(repository.writeCount()).toBe(0);
  });

  it("keeps a task completed or skipped today in today, done or skipped, at its standing schedule", async () => {
    const { repository, readMyDay } = setup();
    // Both advanced to Monday, after today.
    const oct12 = { year: 2026, month: 10, day: 12 };
    repository.addTask(
      {
        id: 1,
        status: "todo",
        due: oct12,
        recurrence: weekdays,
        standingSchedule: standup,
      },
      {
        completionHistory: {
          kind: "readable",
          history: [{ at: at("09T09:00:00"), day: oct9 }],
        },
      },
    );
    repository.addTask(
      {
        id: 2,
        status: "todo",
        due: oct12,
        recurrence: weekdays,
        standingSchedule: standingSchedule("17:30", "18:00"),
      },
      {
        completionHistory: {
          kind: "readable",
          history: [{ at: at("09T09:00:00"), day: oct9, kind: "skip" }],
        },
      },
    );

    const read = await readMyDay();

    expect(
      read.scheduled.map((item) => [
        item.task.id,
        item.done,
        item.skipped,
        item.schedule.start,
      ]),
    ).toEqual([
      [1, true, false, at("09T08:45:00")],
      [2, false, true, at("09T17:30:00")],
    ]);
  });

  it("brings in a weekday task on weekdays, not at the weekend", async () => {
    const { repository, clock, readMyDay } = setup("2026-10-10T10:00:00+08:00");
    // Done on Friday, it advanced to Monday.
    const oct12 = { year: 2026, month: 10, day: 12 };
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct12,
      recurrence: weekdays,
      standingSchedule: standup,
    });

    expect((await readMyDay()).all).toEqual([]);
    clock.set("2026-10-11T10:00:00+08:00");
    expect((await readMyDay()).all).toEqual([]);
    clock.set("2026-10-12T10:00:00+08:00");
    expect((await readMyDay()).scheduled.map((item) => item.task.id)).toEqual([
      1,
    ]);
  });

  it("brings in a fixed schedule task not done on an earlier day, at its standing schedule", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: { year: 2026, month: 10, day: 8 },
      recurrence: weekdays,
      standingSchedule: standup,
    });

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.overdue])).toEqual([
      [1, true],
    ]);
  });

  it("does not bring in a task whose rule is paused, one not advanced, or one without a rule", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct9,
      recurrence: { kind: "rule", rule: { ...weekdays.rule, paused: true } },
      standingSchedule: standup,
    });
    // Completed in Orca's own interface: done, it did not advance.
    repository.addTask(
      {
        id: 2,
        status: "done",
        due: oct9,
        recurrence: weekdays,
        standingSchedule: standup,
      },
      {
        completionHistory: {
          kind: "readable",
          history: [{ at: at("09T09:00:00"), day: oct9 }],
        },
      },
    );
    repository.addTask({
      id: 3,
      status: "todo",
      due: oct9,
      standingSchedule: standup,
    });

    expect((await readMyDay()).all).toEqual([]);
  });

  it("follows today's My Day entry when the task has one, not its standing schedule", async () => {
    const { repository, readMyDay } = setup();
    const afternoon = { start: at("09T14:00:00"), end: at("09T15:00:00") };
    const task = {
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      standingSchedule: standup,
    } as const;
    repository.addTask(
      { id: 1, ...task },
      {
        myDay: {
          kind: "readable",
          entries: [{ day: oct9, schedule: afternoon }],
        },
      },
    );
    repository.addTask(
      { id: 2, ...task },
      { myDay: { kind: "readable", entries: [{ day: oct9 }] } },
    );

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [[1, afternoon]],
    );
    expect(read.unscheduled.map((item) => item.task.id)).toEqual([2]);
  });

  it("puts times before the day boundary at the end of the logical day", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      standingSchedule: standingSchedule("01:00", "02:00"),
    });
    repository.addTask({
      id: 2,
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      // Up to the boundary itself: the end of the day.
      standingSchedule: standingSchedule("23:00", "05:00"),
    });

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [
        [2, { start: at("09T23:00:00"), end: at("10T05:00:00") }],
        [1, { start: at("10T01:00:00"), end: at("10T02:00:00") }],
      ],
    );
  });

  it("shows a standing schedule crossing the day boundary as unscheduled, leaving it as it is", async () => {
    const { repository, dayBoundary, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      standingSchedule: standup,
    });
    // The user moved the boundary into the middle of it afterwards.
    dayBoundary.set({ hours: 9, minutes: 0 });

    const read = await readMyDay();

    expect(read.scheduled).toEqual([]);
    expect(read.unscheduled.map((item) => item.task.id)).toEqual([1]);
    expect((await repository.getTask(1))?.standingSchedule).toEqual(standup);
    expect(repository.writeCount()).toBe(0);
  });

  // For the card's icon (#247): brought in or not, each task tells its own.
  it("tells each task's standing schedule, whether or not today has its entry", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      due: oct9,
      recurrence: weekdays,
      standingSchedule: standup,
    });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        due: oct9,
        recurrence: weekdays,
        standingSchedule: standingSchedule("17:30", "18:00"),
      },
      {
        myDay: {
          kind: "readable",
          entries: [
            {
              day: oct9,
              schedule: { start: at("09T16:00:00"), end: at("09T16:30:00") },
            },
          ],
        },
      },
    );
    repository.addTask(
      { id: 3, status: "todo" },
      { myDay: { kind: "readable", entries: [{ day: oct9 }] } },
    );

    const read = await readMyDay();

    expect(
      read.all
        .map((item) => [item.task.id, item.task.standingSchedule] as const)
        .sort(([a], [b]) => a - b),
    ).toEqual([
      [1, standup],
      [2, standingSchedule("17:30", "18:00")],
      [3, { kind: "none" }],
    ]);
  });
});
