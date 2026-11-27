import { describe, expect, it } from "vitest";
import { sameTimeOfDay, timeOfDayOf } from "./time-of-day";

describe("whether two times of day are the same", () => {
  it("is the same when the hours and the minutes are", () => {
    expect(
      sameTimeOfDay({ hours: 8, minutes: 45 }, { hours: 8, minutes: 45 }),
    ).toBe(true);
  });

  it("differs when the minutes or the hours do", () => {
    const nine = { hours: 9, minutes: 0 };
    expect(sameTimeOfDay(nine, { hours: 9, minutes: 15 })).toBe(false);
    expect(sameTimeOfDay(nine, { hours: 10, minutes: 0 })).toBe(false);
  });
});

// Runs in UTC+8 (pinned in vitest.config.ts); the times below are local.
describe("the time of day of a moment", () => {
  it("is the local hours and minutes", () => {
    expect(timeOfDayOf(new Date("2026-10-08T08:45:00+08:00"))).toEqual({
      hours: 8,
      minutes: 45,
    });
  });

  it("is local time, not UTC", () => {
    expect(timeOfDayOf(new Date("2026-10-08T23:30:00Z"))).toEqual({
      hours: 7,
      minutes: 30,
    });
  });

  it("drops the seconds, to the minute", () => {
    expect(timeOfDayOf(new Date("2026-10-08T09:14:59+08:00"))).toEqual({
      hours: 9,
      minutes: 14,
    });
  });

  it("is 0:00 at midnight", () => {
    expect(timeOfDayOf(new Date("2026-10-09T00:00:00+08:00"))).toEqual({
      hours: 0,
      minutes: 0,
    });
  });
});
