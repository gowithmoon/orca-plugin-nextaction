import { describe, expect, it } from "vitest";
import type { DayBoundary } from "../time/logical-day";
import { addToday, type MyDayEntry, removeToday, todayEntry } from "./my-day";

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
