import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadMyDay } from "./read-my-day";
import { createScheduleInMyDay } from "./schedule-in-my-day";
import { createSetStandingSchedule } from "./set-standing-schedule";
import { createUnscheduleInMyDay } from "./unschedule-in-my-day";

// Adjusting a card its standing schedule brought in (GLOSSARY: 常设排期; ADR
// 0029): the first change writes today's My Day entry, which holds from
// then on. In UTC+8 with the 5:00 boundary; Friday October 9, 2026 is a
// weekday.
const oct9 = { year: 2026, month: 10, day: 9 };
const at = (time: string) => new Date(`2026-10-${time}+08:00`);
const weekdays = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
} as const;
const standup = {
  kind: "schedule",
  schedule: {
    start: { hours: 8, minutes: 45 },
    end: { hours: 9, minutes: 15 },
  },
} as const;
const standupTask = {
  status: "todo",
  due: oct9,
  recurrence: weekdays,
  standingSchedule: standup,
} as const;

function setup(now = "2026-10-09T10:00:00+08:00") {
  const repository = createInMemoryTaskRepository();
  const dayBoundary = createFixedDayBoundary();
  const deps = { repository, clock: createFixedClock(now), dayBoundary };
  return {
    repository,
    dayBoundary,
    scheduleInMyDay: createScheduleInMyDay(deps),
    unscheduleInMyDay: createUnscheduleInMyDay(deps),
    setStandingSchedule: createSetStandingSchedule(deps),
    readMyDay: createReadMyDay({
      ...deps,
      startPreviewDays: createFixedStartPreviewDays(),
    }),
  };
}

describe("adjust a card its standing schedule brought in", () => {
  it("moving it writes today's entry at the new schedule, in one write, leaving the standing schedule as it is", async () => {
    const { repository, scheduleInMyDay, readMyDay } = setup();
    repository.addTask({ id: 1, ...standupTask });

    expect(
      await scheduleInMyDay(1, { start: at("09T10:00:00"), minutes: 30 }),
    ).toEqual({ kind: "changed" });

    const afterMove = { start: at("09T10:00:00"), end: at("09T10:30:00") };
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [{ day: oct9, schedule: afterMove }],
    });
    expect(repository.writeCount()).toBe(1);
    expect((await repository.getTask(1))?.standingSchedule).toEqual(standup);
    const read = await readMyDay();
    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [[1, afterMove]],
    );
  });

  it("moving it back to the unscheduled area writes today's entry unscheduled, keeping it in today", async () => {
    const { repository, unscheduleInMyDay, readMyDay } = setup();
    repository.addTask({ id: 1, ...standupTask });

    expect(await unscheduleInMyDay(1)).toEqual({ kind: "changed" });

    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [{ day: oct9 }],
    });
    expect(repository.writeCount()).toBe(1);
    expect((await repository.getTask(1))?.standingSchedule).toEqual(standup);
    const read = await readMyDay();
    expect(read.scheduled).toEqual([]);
    expect(read.unscheduled.map((item) => item.task.id)).toEqual([1]);
  });

  it("moves one completed today, kept in today as done", async () => {
    const { repository, scheduleInMyDay } = setup();
    // Advanced to Monday, after today.
    repository.addTask(
      { id: 1, ...standupTask, due: { year: 2026, month: 10, day: 12 } },
      {
        completionHistory: {
          kind: "readable",
          history: [{ at: at("09T09:00:00"), day: oct9 }],
        },
      },
    );

    expect(
      await scheduleInMyDay(1, { start: at("09T10:00:00"), minutes: 30 }),
    ).toEqual({ kind: "changed" });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [
        {
          day: oct9,
          schedule: { start: at("09T10:00:00"), end: at("09T10:30:00") },
        },
      ],
    });
  });

  it("writes nothing when it is left where its standing schedule puts it", async () => {
    const { repository, scheduleInMyDay, unscheduleInMyDay, dayBoundary } =
      setup();
    repository.addTask({ id: 1, ...standupTask });

    expect(
      await scheduleInMyDay(1, { start: at("09T08:45:00"), minutes: 30 }),
    ).toEqual({ kind: "unchanged" });
    // Crossing the day boundary, it shows as unscheduled already.
    dayBoundary.set({ hours: 9, minutes: 0 });
    expect(await unscheduleInMyDay(1)).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("is back at its standing schedule the next day it is to be done", async () => {
    const oct12 = { year: 2026, month: 10, day: 12 };
    // Moved on Friday, completed, advanced to Monday.
    const { repository, readMyDay } = setup("2026-10-12T10:00:00+08:00");
    repository.addTask(
      { id: 1, ...standupTask, due: oct12 },
      {
        myDay: {
          kind: "readable",
          entries: [
            {
              day: oct9,
              schedule: { start: at("09T10:00:00"), end: at("09T10:30:00") },
            },
          ],
        },
        completionHistory: {
          kind: "readable",
          history: [{ at: at("09T10:30:00"), day: oct9 }],
        },
      },
    );

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [[1, { start: at("12T08:45:00"), end: at("12T09:15:00") }]],
    );
  });

  it("follows a changed standing schedule until it is adjusted today, then keeps where it was put", async () => {
    const { repository, scheduleInMyDay, readMyDay, setStandingSchedule } =
      setup();
    repository.addTask({ id: 1, ...standupTask });
    repository.addTask({ id: 2, ...standupTask });
    await scheduleInMyDay(2, { start: at("09T10:00:00"), minutes: 30 });

    await setStandingSchedule(1, {
      start: { hours: 9, minutes: 30 },
      end: { hours: 10, minutes: 0 },
    });
    await setStandingSchedule(2, {
      start: { hours: 9, minutes: 30 },
      end: { hours: 10, minutes: 0 },
    });

    const read = await readMyDay();
    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [
        [1, { start: at("09T09:30:00"), end: at("09T10:00:00") }],
        [2, { start: at("09T10:00:00"), end: at("09T10:30:00") }],
      ],
    );
  });
});
