import { describe, expect, it } from "vitest";
import type { RecurrenceRead } from "../recurrence/recurrence";
import { type DayBoundary, logicalDayRange } from "../time/logical-day";
import {
  bringingIn,
  keepingRemoval,
  type StandingSchedule,
  type StandingScheduleCandidate,
  standingScheduleOn,
  standingScheduleProblem,
} from "./standing-schedule";

// Runs in UTC+8 (pinned in vitest.config.ts); the times below are local.
const five: DayBoundary = { hours: 5, minutes: 0 };
const time = (hours: number, minutes = 0) => ({ hours, minutes });
const standup: StandingSchedule = { start: time(8, 45), end: time(9, 15) };
const oct7 = { year: 2026, month: 10, day: 7 };
const oct8 = { year: 2026, month: 10, day: 8 };
const oct9 = { year: 2026, month: 10, day: 9 };
const weekdays: RecurrenceRead = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
};

/** A todo task on weekdays, due October 8, at the standup's times. */
function candidate(
  task: Partial<StandingScheduleCandidate["task"]> = {},
  rest: Omit<StandingScheduleCandidate, "task"> = { entries: [] },
): StandingScheduleCandidate {
  return {
    task: {
      status: "todo",
      start: null,
      due: oct8,
      recurrence: weekdays,
      standingSchedule: { kind: "schedule", schedule: standup },
      ...task,
    },
    ...rest,
  };
}

describe("whether the standing schedule brings a task into My Day", () => {
  it("brings it in on its due date", () => {
    expect(bringingIn(candidate(), oct8)).toEqual(standup);
  });

  it("brings it in after its due date, while it is not done", () => {
    expect(bringingIn(candidate(), oct9)).toEqual(standup);
  });

  it("does not bring it in before its due date", () => {
    expect(bringingIn(candidate(), oct7)).toBeUndefined();
  });

  it("goes by the due date when the task has one, not the start date", () => {
    const task = candidate({ start: oct7, due: oct9 });
    expect(bringingIn(task, oct8)).toBeUndefined();
  });

  it("goes by the start date when the task has no due date", () => {
    const task = candidate({ start: oct8, due: null });
    expect(bringingIn(task, oct7)).toBeUndefined();
    expect(bringingIn(task, oct8)).toEqual(standup);
  });

  it("does not bring in a task without a date", () => {
    const task = candidate({ start: null, due: null });
    expect(bringingIn(task, oct8)).toBeUndefined();
  });

  it("does not bring in a task without a standing schedule, or with one it cannot read", () => {
    const none = candidate({ standingSchedule: { kind: "none" } });
    const unreadable = candidate({
      standingSchedule: { kind: "unreadable", reason: "unknown version 2" },
    });
    expect(bringingIn(none, oct8)).toBeUndefined();
    expect(bringingIn(unreadable, oct8)).toBeUndefined();
  });

  it("does not bring in a task whose rule is gone or paused", () => {
    const none = candidate({ recurrence: { kind: "none" } });
    const paused = candidate({
      recurrence: {
        kind: "rule",
        rule: {
          period: { interval: 1, unit: "weekday" },
          basis: "schedule",
          paused: true,
        },
      },
    });
    expect(bringingIn(none, oct8)).toBeUndefined();
    expect(bringingIn(paused, oct8)).toBeUndefined();
  });

  it("does not bring in a task left done without advancing (未自动重复)", () => {
    expect(bringingIn(candidate({ status: "done" }), oct8)).toBeUndefined();
  });

  it("leaves a day with a My Day entry to the entry, scheduled or not", () => {
    const entries = [{ day: oct8 }];
    expect(bringingIn(candidate({}, { entries }), oct8)).toBeUndefined();
  });

  it("brings it in on a day without an entry, whatever other days hold", () => {
    const entries = [{ day: oct7 }];
    expect(bringingIn(candidate({}, { entries }), oct8)).toEqual(standup);
  });

  it("does not bring it in on the day it was removed from My Day", () => {
    const task = candidate({
      standingSchedule: {
        kind: "schedule",
        schedule: { ...standup, removedOn: oct8 },
      },
    });
    expect(bringingIn(task, oct8)).toBeUndefined();
  });

  it("brings it in again the day after it was removed", () => {
    const removed = { ...standup, removedOn: oct8 };
    const task = candidate({
      standingSchedule: { kind: "schedule", schedule: removed },
    });
    expect(bringingIn(task, oct9)).toEqual(removed);
  });

  it("keeps it in on the day it was completed, its next date later", () => {
    const task = candidate(
      { due: oct9 },
      {
        entries: [],
        lastCompletion: { day: oct8 },
      },
    );
    expect(bringingIn(task, oct8)).toEqual(standup);
  });

  it("keeps it in on the day it was skipped, its next date later", () => {
    const task = candidate(
      { due: oct9 },
      {
        entries: [],
        lastSkip: { day: oct8 },
      },
    );
    expect(bringingIn(task, oct8)).toEqual(standup);
  });

  it("does not bring it in on a day after it was completed, before its next date", () => {
    const due = { year: 2026, month: 10, day: 12 };
    const task = candidate(
      { due },
      { entries: [], lastCompletion: { day: oct8 } },
    );
    expect(bringingIn(task, oct9)).toBeUndefined();
  });
});

describe("a standing schedule on a logical day", () => {
  const oct8Range = logicalDayRange(oct8, five);
  const at = (moment: string) => new Date(`2026-10-${moment}+08:00`);

  it("is its times on that day's clock", () => {
    expect(standingScheduleOn(standup, oct8Range)).toEqual({
      start: at("08T08:45:00"),
      end: at("08T09:15:00"),
    });
  });

  it("puts times before the day boundary in the small hours at the day's end", () => {
    const lateNight = { start: time(23, 30), end: time(1) };
    expect(standingScheduleOn(lateNight, oct8Range)).toEqual({
      start: at("08T23:30:00"),
      end: at("09T01:00:00"),
    });
  });

  it("ends at the next day boundary when its end is on the boundary", () => {
    const untilBoundary = { start: time(23), end: time(5) };
    expect(standingScheduleOn(untilBoundary, oct8Range)).toEqual({
      start: at("08T23:00:00"),
      end: at("09T05:00:00"),
    });
  });

  it("starts at the day boundary when its start is on the boundary", () => {
    const early = { start: time(5), end: time(6) };
    expect(standingScheduleOn(early, oct8Range)).toEqual({
      start: at("08T05:00:00"),
      end: at("08T06:00:00"),
    });
  });

  it("is none when the times cross the day boundary, as after the boundary moved", () => {
    const crossing = { start: time(4), end: time(6) };
    expect(standingScheduleOn(crossing, oct8Range)).toBeUndefined();
  });

  it("is none when the start and the end are the same time, even on the boundary", () => {
    const empty = { start: time(5), end: time(5) };
    expect(standingScheduleOn(empty, oct8Range)).toBeUndefined();
  });
});

describe("why a standing schedule cannot be saved", () => {
  const problem = (start: [number, number?], end: [number, number?]) =>
    standingScheduleProblem({ start: time(...start), end: time(...end) }, five);

  it("has no problem with times on 15-minute steps within one day", () => {
    expect(problem([8, 45], [9, 15])).toBeUndefined();
  });

  it("refuses a start or an end off the 15-minute steps", () => {
    expect(problem([8, 50], [9, 15])).toBe("off-step");
    expect(problem([8, 45], [9, 10])).toBe("off-step");
  });

  it("refuses the same start and end", () => {
    expect(problem([9], [9])).toBe("empty");
    expect(problem([5], [5])).toBe("empty");
  });

  it("refuses an end before the start", () => {
    expect(problem([10], [9])).toBe("crosses-day-boundary");
  });

  it("takes times before the day boundary as the small hours at the day's end", () => {
    expect(problem([23, 30], [1])).toBeUndefined();
    expect(problem([1], [2])).toBeUndefined();
  });

  it("takes an end on the day boundary as the day's very end", () => {
    expect(problem([23], [5])).toBeUndefined();
    expect(problem([5], [5, 15])).toBeUndefined();
  });

  it("refuses times across the day boundary", () => {
    expect(problem([4], [6])).toBe("crosses-day-boundary");
    expect(problem([4, 45], [5, 15])).toBe("crosses-day-boundary");
  });

  it("goes by the day boundary it is given", () => {
    const midnight = { hours: 0, minutes: 0 };
    const lateNight = { start: time(23, 30), end: time(1) };
    expect(standingScheduleProblem(lateNight, midnight)).toBe(
      "crosses-day-boundary",
    );
  });
});

describe("replacing a standing schedule, the day it was removed from My Day on kept", () => {
  const report = { start: time(17, 30), end: time(18) };

  it("carries the removal day over to the new times", () => {
    const current = {
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    } as const;
    expect(keepingRemoval(report, current)).toEqual({
      ...report,
      removedOn: oct8,
    });
  });

  it("takes the new times as they are when the task was never removed", () => {
    const current = { kind: "schedule", schedule: standup } as const;
    expect(keepingRemoval(report, current)).toEqual(report);
  });

  it("takes the new times as they are when there was none, or one it cannot read", () => {
    expect(keepingRemoval(report, { kind: "none" })).toEqual(report);
    expect(
      keepingRemoval(report, { kind: "unreadable", reason: "damaged" }),
    ).toEqual(report);
  });

  it("clears it, the removal day with it", () => {
    const current = {
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    } as const;
    expect(keepingRemoval(null, current)).toBeNull();
  });
});
