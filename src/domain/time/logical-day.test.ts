import { describe, expect, it } from "vitest";
import { type DayBoundary, logicalDay, logicalDayRange } from "./logical-day";

// Runs in UTC+8 (pinned in vitest.config.ts); the times below are local.
const five: DayBoundary = { hours: 5, minutes: 0 };

describe("logicalDay", () => {
  it("puts a moment just before the boundary in the previous day", () => {
    expect(logicalDay(new Date("2026-10-09T04:59:00+08:00"), five)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
  });

  it("puts a moment just after the boundary in that calendar day", () => {
    expect(logicalDay(new Date("2026-10-09T05:01:00+08:00"), five)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
    });
  });

  it("starts the new day exactly at the boundary", () => {
    expect(logicalDay(new Date("2026-10-09T05:00:00+08:00"), five)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
    });
  });

  it("counts seconds before the boundary minute as before it", () => {
    expect(logicalDay(new Date("2026-10-09T04:59:59+08:00"), five)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
  });

  it("matches the calendar day when the boundary is 0:00", () => {
    const midnight: DayBoundary = { hours: 0, minutes: 0 };
    expect(logicalDay(new Date("2026-10-09T00:00:00+08:00"), midnight)).toEqual(
      { year: 2026, month: 10, day: 9 },
    );
    expect(logicalDay(new Date("2026-10-08T23:59:00+08:00"), midnight)).toEqual(
      { year: 2026, month: 10, day: 8 },
    );
  });

  it("names a late boundary's day after the day it starts on", () => {
    // Boundary 23:00: the logical day 10-08 runs from 10-08 23:00 to
    // 10-09 23:00, so most of calendar day 10-09 still belongs to it.
    const late: DayBoundary = { hours: 23, minutes: 0 };
    expect(logicalDay(new Date("2026-10-09T22:59:00+08:00"), late)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
    expect(logicalDay(new Date("2026-10-09T23:00:00+08:00"), late)).toEqual({
      year: 2026,
      month: 10,
      day: 9,
    });
  });

  it("goes back across a month end", () => {
    expect(logicalDay(new Date("2026-11-01T02:00:00+08:00"), five)).toEqual({
      year: 2026,
      month: 10,
      day: 31,
    });
  });

  it("goes back across a year end", () => {
    expect(logicalDay(new Date("2027-01-01T02:00:00+08:00"), five)).toEqual({
      year: 2026,
      month: 12,
      day: 31,
    });
  });
});

describe("logicalDayRange", () => {
  it("runs from that day's boundary to the next day's", () => {
    expect(logicalDayRange({ year: 2026, month: 10, day: 8 }, five)).toEqual({
      start: new Date("2026-10-08T05:00:00+08:00"),
      end: new Date("2026-10-09T05:00:00+08:00"),
    });
  });

  it("crosses a month end", () => {
    expect(logicalDayRange({ year: 2026, month: 10, day: 31 }, five)).toEqual({
      start: new Date("2026-10-31T05:00:00+08:00"),
      end: new Date("2026-11-01T05:00:00+08:00"),
    });
  });

  it("holds the moments the logical day holds, and no others", () => {
    const late: DayBoundary = { hours: 23, minutes: 30 };
    const range = logicalDayRange({ year: 2026, month: 10, day: 8 }, late);
    expect(range).toEqual({
      start: new Date("2026-10-08T23:30:00+08:00"),
      end: new Date("2026-10-09T23:30:00+08:00"),
    });
    expect(logicalDay(range.start, late)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
    expect(logicalDay(new Date(range.end.getTime() - 1), late)).toEqual({
      year: 2026,
      month: 10,
      day: 8,
    });
  });
});
