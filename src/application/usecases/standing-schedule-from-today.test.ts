import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import { StandingScheduleRefusedError } from "./set-standing-schedule";
import {
  createReadStandingScheduleOffer,
  createSetStandingScheduleFromToday,
  NotScheduledTodayError,
} from "./standing-schedule-from-today";

// "Always schedule at this time" from the timeline (GLOSSARY: 常设排期, #247).
// 10:00 on Friday October 9, 2026 in UTC+8, the 5:00 boundary: today is
// October 9, from 5:00 that day to 5:00 on October 10.
const oct8 = { year: 2026, month: 10, day: 8 };
const oct9 = { year: 2026, month: 10, day: 9 };
const at = (time: string) => new Date(`2026-10-${time}+08:00`);
const weekdays = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
} as const;
const time = (hours: number, minutes = 0) => ({ hours, minutes });
const standup = { start: time(8, 45), end: time(9, 15) };
const scheduledToday = (start: string, end: string) =>
  ({
    myDay: {
      kind: "readable",
      entries: [{ day: oct9, schedule: { start: at(start), end: at(end) } }],
    },
  }) as const;

function setup() {
  const repository = createInMemoryTaskRepository();
  const deps = {
    repository,
    clock: createFixedClock("2026-10-09T10:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
  };
  return {
    repository,
    setFromToday: createSetStandingScheduleFromToday(deps),
    readOffer: createReadStandingScheduleOffer(deps),
  };
}

const standingOf = async (repository: InMemoryTaskRepository, id: number) =>
  (await repository.getTask(id))?.standingSchedule;

describe("set the standing schedule from today's schedule", () => {
  it("takes the times of day of today's schedule, in one write, the entries kept", async () => {
    const { repository, setFromToday } = setup();
    repository.addTask(
      { id: 1, status: "todo", recurrence: weekdays },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    );

    expect(await setFromToday(1)).toEqual(standup);
    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: standup,
    });
    expect(repository.writeCount()).toBe(1);
    expect(await repository.readMyDay(1)).toEqual(
      scheduledToday("09T08:45:00", "09T09:15:00").myDay,
    );
  });

  it("takes a schedule late at night, up to the next day boundary, as times before the boundary", async () => {
    const { repository, setFromToday } = setup();
    repository.addTask(
      { id: 1, status: "todo", recurrence: weekdays },
      scheduledToday("09T23:30:00", "10T05:00:00"),
    );

    expect(await setFromToday(1)).toEqual({
      start: time(23, 30),
      end: time(5),
    });
  });

  it("keeps the day it was removed from My Day on, replacing a standing schedule at other times (#245)", async () => {
    const { repository, setFromToday } = setup();
    repository.addTask(
      {
        id: 1,
        status: "todo",
        recurrence: weekdays,
        standingSchedule: {
          kind: "schedule",
          schedule: { start: time(17, 30), end: time(18), removedOn: oct8 },
        },
      },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    );

    await setFromToday(1);

    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    });
  });
});

describe("set the standing schedule from today's schedule, refused", () => {
  it("refuses a task without a recurrence rule, writing nothing", async () => {
    const { repository, setFromToday } = setup();
    repository.addTask(
      { id: 1, status: "todo" },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    );

    await expect(setFromToday(1)).rejects.toEqual(
      new StandingScheduleRefusedError("not-recurring"),
    );
    expect(repository.writeCount()).toBe(0);
  });

  it.each([
    ["no entry", { myDay: { kind: "readable", entries: [] } }],
    [
      "today's entry unscheduled",
      { myDay: { kind: "readable", entries: [{ day: oct9 }] } },
    ],
    [
      "only yesterday's entry scheduled",
      {
        myDay: {
          kind: "readable",
          entries: [
            {
              day: oct8,
              schedule: { start: at("08T08:45:00"), end: at("08T09:15:00") },
            },
            { day: oct9 },
          ],
        },
      },
    ],
    // Outside today's range, e.g. after the day boundary moved, it reads as
    // unscheduled (ADR 0020).
    [
      "today's schedule outside today",
      scheduledToday("09T04:00:00", "09T06:00:00"),
    ],
  ] as const)(
    "refuses a task not scheduled today (%s), writing nothing",
    async (_case, setupWith) => {
      const { repository, setFromToday } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: weekdays },
        setupWith,
      );

      await expect(setFromToday(1)).rejects.toEqual(
        new NotScheduledTodayError(1),
      );
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("refuses a task whose My Day entries cannot be read, writing nothing", async () => {
    const { repository, setFromToday } = setup();
    repository.addTask(
      { id: 1, status: "todo", recurrence: weekdays },
      { myDay: { kind: "unreadable", reason: "unknown version 9" } },
    );

    await expect(setFromToday(1)).rejects.toEqual(
      new MyDayUnreadableError(1, "unknown version 9"),
    );
    expect(repository.writeCount()).toBe(0);
  });
});

// What the timeline card's task menu offers (#247).
describe("read the offer to set the standing schedule from today", () => {
  it("offers today's times to a recurring task scheduled today, without one yet", async () => {
    const { repository, readOffer } = setup();
    repository.addTask(
      { id: 1, status: "todo", recurrence: weekdays },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    );

    expect(await readOffer(1)).toEqual({ times: standup, replacing: false });
  });

  it("offers to replace a standing schedule at other times", async () => {
    const { repository, readOffer } = setup();
    repository.addTask(
      {
        id: 1,
        status: "todo",
        recurrence: weekdays,
        standingSchedule: {
          kind: "schedule",
          schedule: { start: time(8), end: time(8, 30) },
        },
      },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    );

    expect(await readOffer(1)).toEqual({ times: standup, replacing: true });
  });

  it.each([
    [
      "without a recurrence rule",
      { id: 1, status: "todo" },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    ],
    [
      "not scheduled today",
      { id: 1, status: "todo", recurrence: weekdays },
      { myDay: { kind: "readable", entries: [{ day: oct9 }] } },
    ],
    [
      "with its My Day entries unreadable",
      { id: 1, status: "todo", recurrence: weekdays },
      { myDay: { kind: "unreadable", reason: "unknown version 9" } },
    ],
    [
      "with its standing schedule unreadable",
      {
        id: 1,
        status: "todo",
        recurrence: weekdays,
        standingSchedule: { kind: "unreadable", reason: "unknown version 2" },
      },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    ],
    [
      "with its standing schedule at today's times already",
      {
        id: 1,
        status: "todo",
        recurrence: weekdays,
        standingSchedule: { kind: "schedule", schedule: standup },
      },
      scheduledToday("09T08:45:00", "09T09:15:00"),
    ],
  ] as const)("offers nothing to a task %s", async (_case, task, setupWith) => {
    const { repository, readOffer } = setup();
    repository.addTask(task, setupWith);

    expect(await readOffer(1)).toBeNull();
  });
});
