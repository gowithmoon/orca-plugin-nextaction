import { describe, expect, it } from "vitest";
import { type DayBoundary, logicalDayRange } from "../time/logical-day";
import {
  addToday,
  type MyDayEntry,
  moveSchedule,
  newScheduleStart,
  normalizeSchedule,
  removeToday,
  resizeScheduleStart,
  scheduleToday,
  scheduleWithin,
  todayEntry,
  unscheduleToday,
} from "./my-day";

// Runs in UTC+8 (pinned in vitest.config.ts); the times below are local.
const five: DayBoundary = { hours: 5, minutes: 0 };
const oct8Morning = new Date("2026-10-08T09:00:00+08:00");

const oct1: MyDayEntry = { day: { year: 2026, month: 10, day: 1 } };
const oct7Scheduled: MyDayEntry = {
  day: { year: 2026, month: 10, day: 7 },
  schedule: {
    start: new Date("2026-10-07T09:00:00+08:00"),
    end: new Date("2026-10-07T10:00:00+08:00"),
  },
};
const oct8: MyDayEntry = { day: { year: 2026, month: 10, day: 8 } };

describe("today's My Day entry", () => {
  it("is none for a task never added to My Day", () => {
    expect(todayEntry([], oct8Morning, five)).toBeUndefined();
  });

  it("is none when the task holds only past entries", () => {
    expect(
      todayEntry([oct1, oct7Scheduled], oct8Morning, five),
    ).toBeUndefined();
  });

  it("is the entry of the current logical day", () => {
    expect(todayEntry([oct1, oct8], oct8Morning, five)).toEqual(oct8);
  });

  it("at 2:00, before the day boundary, is the previous day's entry", () => {
    const oct8TwoAm = new Date("2026-10-08T02:00:00+08:00");
    expect(todayEntry([oct7Scheduled, oct8], oct8TwoAm, five)).toEqual(
      oct7Scheduled,
    );
  });

  it("from the day boundary on, is the new day's entry", () => {
    const oct8FiveAm = new Date("2026-10-08T05:00:00+08:00");
    expect(todayEntry([oct7Scheduled, oct8], oct8FiveAm, five)).toEqual(oct8);
  });
});

describe("adding a task to today's My Day", () => {
  const today = { year: 2026, month: 10, day: 8 };

  it("appends an unscheduled entry for today at the end, past entries kept as they are", () => {
    expect(addToday([oct1, oct7Scheduled], today)).toEqual([
      oct1,
      oct7Scheduled,
      { day: { year: 2026, month: 10, day: 8 } },
    ]);
  });

  it("starts the entries of a task never added", () => {
    expect(addToday([], today)).toEqual([
      { day: { year: 2026, month: 10, day: 8 } },
    ]);
  });

  it("leaves the entries as they are when the task is already in today's My Day", () => {
    const scheduledToday: MyDayEntry = {
      day: today,
      schedule: {
        start: new Date("2026-10-08T14:00:00+08:00"),
        end: new Date("2026-10-08T15:00:00+08:00"),
      },
    };
    const entries = [oct1, scheduledToday];
    expect(addToday(entries, today)).toBe(entries);
  });

  it("never holds two entries for one logical day, adding twice", () => {
    expect(addToday(addToday([oct1], today), today)).toEqual([
      oct1,
      { day: { year: 2026, month: 10, day: 8 } },
    ]);
  });
});

describe("removing a task from today's My Day", () => {
  const today = { year: 2026, month: 10, day: 8 };

  it("deletes only today's entry, past entries kept as they are", () => {
    expect(removeToday([oct1, oct7Scheduled, oct8], today)).toEqual([
      oct1,
      oct7Scheduled,
    ]);
  });

  it("leaves no entries when today's was the only one", () => {
    expect(removeToday([oct8], today)).toEqual([]);
  });

  it("leaves the entries as they are when the task is not in today's My Day", () => {
    const entries = [oct1, oct7Scheduled];
    expect(removeToday(entries, today)).toBe(entries);
  });
});

describe("whether a schedule holds on today", () => {
  const oct8 = { year: 2026, month: 10, day: 8 };
  const at = (time: string) => new Date(`2026-10-${time}+08:00`);

  it("holds when it lies within today's range", () => {
    const schedule = { start: at("08T14:00:00"), end: at("08T15:00:00") };
    expect(scheduleWithin(schedule, logicalDayRange(oct8, five))).toBe(true);
  });

  it("holds from the day boundary to the next one, both ends included", () => {
    const schedule = { start: at("08T05:00:00"), end: at("09T05:00:00") };
    expect(scheduleWithin(schedule, logicalDayRange(oct8, five))).toBe(true);
  });

  it("does not hold once the day boundary moved past its start", () => {
    // Scheduled 5:00–6:00 under a 5:00 boundary; the user then set 6:00.
    const schedule = { start: at("08T05:00:00"), end: at("08T06:00:00") };
    const six: DayBoundary = { hours: 6, minutes: 0 };
    expect(scheduleWithin(schedule, logicalDayRange(oct8, six))).toBe(false);
  });

  it("does not hold when it runs past the next day boundary", () => {
    const schedule = { start: at("09T04:00:00"), end: at("09T05:30:00") };
    expect(scheduleWithin(schedule, logicalDayRange(oct8, five))).toBe(false);
  });

  it("does not hold on another day", () => {
    const schedule = { start: at("07T14:00:00"), end: at("07T15:00:00") };
    expect(scheduleWithin(schedule, logicalDayRange(oct8, five))).toBe(false);
  });
});

describe("scheduling today's entry", () => {
  const today = { year: 2026, month: 10, day: 8 };
  const nine = {
    start: new Date("2026-10-08T09:00:00+08:00"),
    end: new Date("2026-10-08T10:00:00+08:00"),
  };

  it("gives today's entry the schedule, past entries kept as they are", () => {
    expect(scheduleToday([oct1, oct7Scheduled, oct8], today, nine)).toEqual([
      oct1,
      oct7Scheduled,
      {
        day: { year: 2026, month: 10, day: 8 },
        schedule: {
          start: new Date("2026-10-08T09:00:00+08:00"),
          end: new Date("2026-10-08T10:00:00+08:00"),
        },
      },
    ]);
  });

  it("leaves the entries as they are when today's entry already has that schedule", () => {
    const entries = [
      oct1,
      {
        day: today,
        schedule: {
          start: new Date("2026-10-08T09:00:00+08:00"),
          end: new Date("2026-10-08T10:00:00+08:00"),
        },
      },
    ];
    expect(scheduleToday(entries, today, nine)).toBe(entries);
  });

  it("leaves the entries as they are when the task is not in today's My Day", () => {
    const entries = [oct1, oct7Scheduled];
    expect(scheduleToday(entries, today, nine)).toBe(entries);
  });
});

describe("unscheduling today's entry", () => {
  const today = { year: 2026, month: 10, day: 8 };
  const oct8Scheduled: MyDayEntry = {
    day: today,
    schedule: {
      start: new Date("2026-10-08T09:00:00+08:00"),
      end: new Date("2026-10-08T10:00:00+08:00"),
    },
  };

  it("keeps today's entry, unscheduled, past entries kept as they are", () => {
    expect(unscheduleToday([oct7Scheduled, oct8Scheduled], today)).toEqual([
      oct7Scheduled,
      { day: { year: 2026, month: 10, day: 8 } },
    ]);
  });

  it("leaves the entries as they are when today's entry is unscheduled already", () => {
    const entries = [oct7Scheduled, oct8];
    expect(unscheduleToday(entries, today)).toBe(entries);
  });

  it("leaves the entries as they are when the task is not in today's My Day", () => {
    const entries = [oct1, oct7Scheduled];
    expect(unscheduleToday(entries, today)).toBe(entries);
  });
});

describe("normalizing a schedule", () => {
  const oct8 = { year: 2026, month: 10, day: 8 };
  const day = logicalDayRange(oct8, five);
  const at = (time: string) => new Date(`2026-10-${time}+08:00`);

  it("snaps the start to the nearest 15 minutes", () => {
    expect(
      normalizeSchedule({ start: at("08T09:07:00"), minutes: 60 }, day),
    ).toEqual({ start: at("08T09:00:00"), end: at("08T10:00:00") });
    expect(
      normalizeSchedule({ start: at("08T09:08:00"), minutes: 60 }, day),
    ).toEqual({ start: at("08T09:15:00"), end: at("08T10:15:00") });
  });

  it("snaps the length to the nearest 15 minutes", () => {
    expect(
      normalizeSchedule({ start: at("08T09:00:00"), minutes: 50 }, day),
    ).toEqual({ start: at("08T09:00:00"), end: at("08T09:45:00") });
  });

  it("is never shorter than 15 minutes", () => {
    expect(
      normalizeSchedule({ start: at("08T09:00:00"), minutes: 5 }, day),
    ).toEqual({ start: at("08T09:00:00"), end: at("08T09:15:00") });
    expect(
      normalizeSchedule({ start: at("08T09:00:00"), minutes: -30 }, day),
    ).toEqual({ start: at("08T09:00:00"), end: at("08T09:15:00") });
  });

  it("ends at the next day boundary at the latest, cutting the length short", () => {
    expect(
      normalizeSchedule({ start: at("09T04:00:00"), minutes: 120 }, day),
    ).toEqual({ start: at("09T04:00:00"), end: at("09T05:00:00") });
  });

  it("starts at today's day boundary at the earliest, keeping the length", () => {
    expect(
      normalizeSchedule({ start: at("08T04:00:00"), minutes: 60 }, day),
    ).toEqual({ start: at("08T05:00:00"), end: at("08T06:00:00") });
  });

  it("takes a past time of today as it is", () => {
    // Scheduled at 9:00 while it is already afternoon: kept, to record it.
    expect(
      normalizeSchedule({ start: at("08T09:00:00"), minutes: 60 }, day),
    ).toEqual({ start: at("08T09:00:00"), end: at("08T10:00:00") });
  });

  it("starts 15 minutes before the next day boundary at the latest", () => {
    expect(
      normalizeSchedule({ start: at("09T05:30:00"), minutes: 60 }, day),
    ).toEqual({ start: at("09T04:45:00"), end: at("09T05:00:00") });
  });
});

describe("moving a schedule", () => {
  const oct8 = { year: 2026, month: 10, day: 8 };
  const day = logicalDayRange(oct8, five);
  const at = (time: string) => new Date(`2026-10-${time}+08:00`);
  const ninetyMinutes = { start: at("08T09:00:00"), end: at("08T10:30:00") };

  it("starts it at the new time, snapped to 15 minutes, keeping its length", () => {
    expect(moveSchedule(ninetyMinutes, at("08T14:07:00"), day)).toEqual({
      start: at("08T14:00:00"),
      end: at("08T15:30:00"),
    });
  });

  it("ends at the next day boundary at the latest, starting earlier to keep its length", () => {
    expect(moveSchedule(ninetyMinutes, at("09T04:30:00"), day)).toEqual({
      start: at("09T03:30:00"),
      end: at("09T05:00:00"),
    });
  });

  it("starts at today's day boundary at the earliest, keeping its length", () => {
    expect(moveSchedule(ninetyMinutes, at("08T03:00:00"), day)).toEqual({
      start: at("08T05:00:00"),
      end: at("08T06:30:00"),
    });
  });
});

describe("resizing a schedule's start", () => {
  const oct8 = { year: 2026, month: 10, day: 8 };
  const day = logicalDayRange(oct8, five);
  const at = (time: string) => new Date(`2026-10-${time}+08:00`);
  const nineToTen = { start: at("08T09:00:00"), end: at("08T10:00:00") };

  it("starts it at the new time, snapped to 15 minutes, keeping its end", () => {
    expect(resizeScheduleStart(nineToTen, at("08T08:22:00"), day)).toEqual({
      start: at("08T08:15:00"),
      end: at("08T10:00:00"),
    });
  });

  it("leaves it 15 minutes long at the shortest", () => {
    expect(resizeScheduleStart(nineToTen, at("08T09:58:00"), day)).toEqual({
      start: at("08T09:45:00"),
      end: at("08T10:00:00"),
    });
  });

  it("starts at today's day boundary at the earliest", () => {
    expect(resizeScheduleStart(nineToTen, at("08T03:00:00"), day)).toEqual({
      start: at("08T05:00:00"),
      end: at("08T10:00:00"),
    });
  });
});

describe("a new schedule's start", () => {
  const oct8 = { year: 2026, month: 10, day: 8 };
  const day = logicalDayRange(oct8, five);
  const at = (time: string) => new Date(`2026-10-${time}+08:00`);

  it("is the next quarter hour on the local clock after now", () => {
    expect(newScheduleStart(day, at("08T09:07:30"))).toEqual(at("08T09:15:00"));
    expect(newScheduleStart(day, at("09T01:46:00"))).toEqual(at("09T02:00:00"));
  });

  it("is now itself when now is on a quarter hour", () => {
    expect(newScheduleStart(day, at("08T09:15:00"))).toEqual(at("08T09:15:00"));
  });

  it("is the day boundary when now is not within the day", () => {
    expect(newScheduleStart(day, at("08T04:59:00"))).toEqual(at("08T05:00:00"));
    expect(newScheduleStart(day, at("09T05:00:00"))).toEqual(at("08T05:00:00"));
  });

  it("snaps by the local clock where the zone's offset is not a whole quarter hour", () => {
    // Asia/Shanghai (pinned in vitest.config.ts) kept local mean time,
    // UTC+8:05:43, in 1900: a quarter hour of the epoch is not one locally.
    const jan1 = { year: 1900, month: 1, day: 1 };
    expect(new Date(1900, 0, 1).getTimezoneOffset()).not.toBe(-480);
    expect(
      newScheduleStart(
        logicalDayRange(jan1, five),
        new Date(1900, 0, 1, 10, 7),
      ),
    ).toEqual(new Date(1900, 0, 1, 10, 15));
  });
});
