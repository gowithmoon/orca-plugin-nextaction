import { describe, expect, it } from "vitest";
import { timeOfDayOf } from "./time-of-day";

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
