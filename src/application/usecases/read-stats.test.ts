import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { RecurrenceRead } from "../../domain/recurrence/recurrence";
import { createReadStats, type ReadStatsResult } from "./read-stats";

const october = (day: number) => ({ year: 2026, month: 10, day });

/** A daily recurrence rule; `paused` pauses it. */
const daily = (paused = false): RecurrenceRead => ({
  kind: "rule",
  rule: {
    period: { interval: 1, unit: "day" },
    basis: "schedule",
    ...(paused && { paused }),
  },
});

/**
 * An entry of the completion history at `at` (local, UTC+8), recorded in
 * the logical day October `day`.
 */
const recorded = (at: string, day: number, kind?: "skip") => ({
  at: new Date(`${at}+08:00`),
  day: october(day),
  ...(kind && { kind }),
});
const history = (...entries: ReturnType<typeof recorded>[]) => ({
  completionHistory: { kind: "readable" as const, history: entries },
});

function setup() {
  const repository = createInMemoryTaskRepository();
  const readStats = createReadStats({
    repository,
    // Wednesday October 14, 2026, 09:00 in UTC+8: the logical day October 14,
    // in the week of Monday October 12 to Sunday October 18.
    clock: createFixedClock("2026-10-14T09:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readStats };
}

/** Each cell's completions and skips, in order. */
const counts = (read: ReadStatsResult) =>
  read.cells.map((cell) => [cell.completions, cell.skips]);

describe("read stats", () => {
  describe("this week", () => {
    it("counts every completion of a recurring task on its logical day", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          recorded("2026-10-12T10:00:00", 12),
          recorded("2026-10-13T10:00:00", 13),
          recorded("2026-10-14T08:00:00", 14),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read)).toEqual([
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
    });
  });

  describe("recurring tasks", () => {
    it("counts every completion and every skip of a paused recurring task, apart", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily(true) },
        history(
          recorded("2026-10-12T10:00:00", 12),
          recorded("2026-10-12T20:00:00", 12, "skip"),
          recorded("2026-10-13T10:00:00", 13),
          recorded("2026-10-13T11:00:00", 13),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read).slice(0, 2)).toEqual([
        [1, 1],
        [2, 0],
      ]);
      expect(read.totals).toEqual({ completions: 3, skips: 1 });
    });
  });

  describe("plain tasks", () => {
    it("does not count a task set back to not done", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo" },
        history(recorded("2026-10-13T10:00:00", 13)),
      );

      const read = await readStats({ scale: "week" });

      expect(read.cells.every((cell) => cell.completions === 0)).toBe(true);
    });

    it("counts a task completed, reopened and completed again once, on the last completion's day", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "done" },
        history(
          recorded("2026-10-12T10:00:00", 12),
          recorded("2026-10-14T08:00:00", 14),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read)).toEqual([
        [0, 0],
        [0, 0],
        [1, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
    });

    it("counts the skips in its history, though it is not done", async () => {
      const { repository, readStats } = setup();
      // Its rule removed after a skip and a completion: a plain task now.
      repository.addTask(
        { id: 1, status: "todo" },
        history(
          recorded("2026-10-12T10:00:00", 12, "skip"),
          recorded("2026-10-13T10:00:00", 13),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read)).toEqual([
        [0, 1],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
    });

    it("does not count the past completions of a recurring task's subtask set back to todo", async () => {
      const { repository, readStats } = setup();
      repository.addTask({ id: 1, status: "todo", recurrence: daily() });
      // Completed on Monday, then reset when its parent advanced.
      repository.addTask(
        { id: 2, status: "todo" },
        { parentId: 1, ...history(recorded("2026-10-12T10:00:00", 12)) },
      );

      const read = await readStats({ scale: "week" });

      expect(read.totals).toEqual({ completions: 0, skips: 0 });
    });

    it("counts only the last completion of a task whose rule is gone", async () => {
      const { repository, readStats } = setup();
      // It recurred until its end condition, then was completed for good.
      repository.addTask(
        { id: 1, status: "done" },
        history(
          recorded("2026-10-12T10:00:00", 12),
          recorded("2026-10-13T10:00:00", 13),
          recorded("2026-10-15T10:00:00", 15),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read).map(([completions]) => completions)).toEqual([
        0, 0, 0, 1, 0, 0, 0,
      ]);
    });

    it("does not count a done task without a completion", async () => {
      const { repository, readStats } = setup();
      // Set to done in Orca's own interface: no completion recorded.
      repository.addTask({ id: 1, status: "done" });

      const read = await readStats({ scale: "week" });

      expect(read.totals).toEqual({ completions: 0, skips: 0 });
    });

    it("counts a parent and its subtask each on their own", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "done" },
        history(recorded("2026-10-13T10:00:00", 13)),
      );
      repository.addTask(
        { id: 2, status: "done" },
        { parentId: 1, ...history(recorded("2026-10-12T10:00:00", 12)) },
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read).map(([completions]) => completions)).toEqual([
        1, 1, 0, 0, 0, 0, 0,
      ]);
    });
  });

  describe("completion history", () => {
    it("reads the other tasks when one's completion history cannot be read", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "done" },
        {
          completionHistory: {
            kind: "unreadable",
            reason: "unknown version 2",
          },
        },
      );
      repository.addTask(
        { id: 2, status: "done" },
        history(recorded("2026-10-13T10:00:00", 13)),
      );

      const read = await readStats({ scale: "week" });

      expect(read.totals).toEqual({ completions: 1, skips: 0 });
    });
  });

  describe("logical days", () => {
    it("counts a completion before the day boundary on the logical day before", async () => {
      const { repository, readStats } = setup();
      // 04:30 on Tuesday, before the 05:00 boundary: the logical day Monday.
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(recorded("2026-10-13T04:30:00", 12)),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read).slice(0, 2)).toEqual([
        [1, 0],
        [0, 0],
      ]);
    });

    it("counts Monday and Sunday in the week, the days either side out of it", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          // The logical day Sunday October 11: last week.
          recorded("2026-10-12T04:30:00", 11),
          recorded("2026-10-12T05:00:00", 12),
          recorded("2026-10-19T04:30:00", 18),
          // The logical day Monday October 19: next week.
          recorded("2026-10-19T05:00:00", 19),
        ),
      );

      const read = await readStats({ scale: "week" });

      expect(counts(read).map(([completions]) => completions)).toEqual([
        1, 0, 0, 0, 0, 0, 1,
      ]);
      expect(read.totals.completions).toBe(2);
    });

    it("reads the week of today's logical day, Monday to Sunday", async () => {
      const { readStats } = setup();

      const read = await readStats({ scale: "week" });

      expect(read.period).toMatchObject({
        first: october(12),
        last: october(18),
      });
      expect(read.cells.map((cell) => cell.first)).toEqual(
        [12, 13, 14, 15, 16, 17, 18].map(october),
      );
    });

    it("reads the week of the anchor day", async () => {
      const { readStats } = setup();

      // Sunday October 4: the week of September 28 to October 4.
      const read = await readStats({ scale: "week", anchor: october(4) });

      expect(read.period).toMatchObject({
        first: { year: 2026, month: 9, day: 28 },
        last: october(4),
      });
    });
  });

  describe("stats periods", () => {
    it("reads February with 29 days in a leap year and 28 otherwise", async () => {
      const { readStats } = setup();

      const leap = await readStats({
        scale: "month",
        anchor: { year: 2024, month: 2, day: 10 },
      });
      const common = await readStats({
        scale: "month",
        anchor: { year: 2025, month: 2, day: 10 },
      });

      expect(leap.cells).toHaveLength(29);
      expect(leap.period.last).toEqual({ year: 2024, month: 2, day: 29 });
      expect(common.cells).toHaveLength(28);
      expect(common.period.last).toEqual({ year: 2025, month: 2, day: 28 });
    });

    it("reads a year as a cell per month, each from its first day to its last", async () => {
      const { readStats } = setup();

      const read = await readStats({ scale: "year" });

      expect(read.period).toMatchObject({
        scale: "year",
        first: { year: 2026, month: 1, day: 1 },
        last: { year: 2026, month: 12, day: 31 },
      });
      expect(read.cells).toHaveLength(12);
      expect(read.cells[1]).toMatchObject({
        first: { year: 2026, month: 2, day: 1 },
        last: { year: 2026, month: 2, day: 28 },
      });
      expect(read.cells[9]).toMatchObject({
        first: october(1),
        last: october(31),
      });
    });

    it("reads a month as a cell per day, as many as the month has", async () => {
      const { readStats } = setup();

      const read = await readStats({ scale: "month" });

      expect(read.period).toMatchObject({
        scale: "month",
        first: october(1),
        last: october(31),
      });
      expect(read.cells).toHaveLength(31);
      expect(read.cells[30]).toMatchObject({
        first: october(31),
        last: october(31),
      });
    });

    it("pages back to the period before, without end", async () => {
      const { readStats } = setup();

      const october2026 = await readStats({ scale: "month" });
      const september = await readStats({
        scale: "month",
        anchor: october2026.paging.previous,
      });
      const lastYear = await readStats({
        scale: "year",
        anchor: (await readStats({ scale: "year" })).paging.previous,
      });
      const lastWeek = await readStats({
        scale: "week",
        anchor: (await readStats({ scale: "week" })).paging.previous,
      });

      expect(september.period).toMatchObject({
        first: { year: 2026, month: 9, day: 1 },
        last: { year: 2026, month: 9, day: 30 },
      });
      expect(lastYear.period).toMatchObject({
        first: { year: 2025, month: 1, day: 1 },
        last: { year: 2025, month: 12, day: 31 },
      });
      expect(lastWeek.period).toMatchObject({
        first: october(5),
        last: october(11),
      });
    });

    it("does not page forward past the current period", async () => {
      const { readStats } = setup();

      for (const scale of ["week", "month", "year"] as const) {
        const read = await readStats({ scale });
        expect(read.paging).toMatchObject({ current: true });
        expect(read.paging.next).toBeUndefined();
      }
    });

    it("reads a past period, paging forward to the one after it", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          {
            at: new Date("2026-08-31T10:00:00+08:00"),
            day: { year: 2026, month: 8, day: 31 },
          },
          {
            at: new Date("2026-09-30T10:00:00+08:00"),
            day: { year: 2026, month: 9, day: 30 },
          },
          recorded("2026-10-01T10:00:00", 1),
        ),
      );

      const september = await readStats({
        scale: "month",
        anchor: { year: 2026, month: 9, day: 15 },
      });

      expect(september.paging).toMatchObject({
        current: false,
        next: october(1),
      });
      expect(september.totals.completions).toBe(1);
      expect(september.cells[29]).toMatchObject({ completions: 1 });
    });

    it("pages forward from a week before onto the current week", async () => {
      const { readStats } = setup();

      const lastWeek = await readStats({ scale: "week", anchor: october(5) });

      expect(lastWeek.paging.next).toEqual(october(12));
    });

    it("reads the current period for an anchor after it", async () => {
      const { readStats } = setup();

      const read = await readStats({
        scale: "month",
        anchor: { year: 2026, month: 12, day: 1 },
      });

      expect(read.period).toMatchObject({ first: october(1) });
      expect(read.paging.current).toBe(true);
    });

    it("counts a month's first and last day in it, the days either side out of it", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          // 04:30 on October 1, before the boundary: the logical day
          // September 30.
          {
            at: new Date("2026-10-01T04:30:00+08:00"),
            day: { year: 2026, month: 9, day: 30 },
          },
          recorded("2026-10-01T05:00:00", 1),
          recorded("2026-11-01T04:30:00", 31),
          {
            at: new Date("2026-11-01T05:00:00+08:00"),
            day: { year: 2026, month: 11, day: 1 },
          },
        ),
      );

      const read = await readStats({ scale: "month", anchor: october(1) });

      expect(read.cells[0]).toMatchObject({ completions: 1 });
      expect(read.cells[30]).toMatchObject({ completions: 1 });
      expect(read.totals.completions).toBe(2);
    });

    it("counts a year's first and last day in its first and last month", async () => {
      const { repository, readStats } = setup();
      const at = (iso: string, year: number, month: number, day: number) => ({
        at: new Date(`${iso}+08:00`),
        day: { year, month, day },
      });
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          at("2025-01-01T04:30:00", 2024, 12, 31),
          at("2025-01-01T05:00:00", 2025, 1, 1),
          at("2025-01-31T10:00:00", 2025, 1, 31),
          at("2025-12-31T10:00:00", 2025, 12, 31),
          at("2026-01-01T04:30:00", 2025, 12, 31),
          at("2026-01-01T05:00:00", 2026, 1, 1),
        ),
      );

      const read = await readStats({
        scale: "year",
        anchor: { year: 2025, month: 6, day: 1 },
      });

      expect(counts(read).map(([completions]) => completions)).toEqual([
        2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2,
      ]);
    });

    it("leaves the current period's days and months still to come at 0", async () => {
      const { repository, readStats } = setup();
      repository.addTask(
        { id: 1, status: "todo", recurrence: daily() },
        history(
          recorded("2026-10-13T10:00:00", 13),
          recorded("2026-10-14T08:00:00", 14),
        ),
      );

      const month = await readStats({ scale: "month" });
      const year = await readStats({ scale: "year" });

      // October 15 to 31.
      expect(month.cells.slice(14)).toHaveLength(17);
      expect(
        month.cells.slice(14).every((c) => c.completions + c.skips === 0),
      ).toBe(true);
      expect(month.cells[13]).toMatchObject({ completions: 1 });
      expect(counts(year).map(([completions]) => completions)).toEqual([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0,
      ]);
    });
  });

  describe("the header's numbers", () => {
    it("counts the next actions as the next action view does, whatever blocks the others", async () => {
      const { repository, readStats } = setup();
      repository.addTask({ id: 1, status: "todo" });
      // Held back by its open subtask 3.
      repository.addTask({ id: 2, status: "todo" });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "doing" });
      repository.addTask({ id: 5, status: "waiting" });
      // Not started yet: it starts tomorrow.
      repository.addTask({ id: 6, status: "todo", start: october(15) });

      const read = await readStats({ scale: "week" });

      expect(read.now.nextActions).toBe(3);
    });

    it("counts the doing and the waiting tasks by their status, blocked or not", async () => {
      const { repository, readStats } = setup();
      repository.addTask({ id: 1, status: "doing" });
      // Doing, though held back by its open subtask 3.
      repository.addTask({ id: 2, status: "doing" });
      repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
      repository.addTask({ id: 4, status: "waiting" });
      repository.addTask({ id: 5, status: "waiting" }, { parentId: 4 });
      repository.addTask({ id: 6, status: "waiting" });
      repository.addTask({ id: 7, status: "someday" });
      repository.addTask({ id: 8, status: "done" });

      const read = await readStats({ scale: "week" });

      expect(read.now).toMatchObject({ doing: 2, waiting: 3 });
    });

    it("counts the overdue tasks by their due date, the done ones not", async () => {
      const { repository, readStats } = setup();
      // Overdue: due yesterday, whatever the status.
      repository.addTask({ id: 1, status: "todo", due: october(13) });
      repository.addTask({ id: 2, status: "waiting", due: october(1) });
      repository.addTask({ id: 3, status: "someday", due: october(12) });
      // Not overdue: due today, due later, done, no due date.
      repository.addTask({ id: 4, status: "todo", due: october(14) });
      repository.addTask({ id: 5, status: "todo", due: october(20) });
      repository.addTask({ id: 6, status: "done", due: october(2) });
      repository.addTask({ id: 7, status: "todo" });

      const read = await readStats({ scale: "week" });

      expect(read.now).toMatchObject({ overdue: 3 });
    });

    it("gives the same numbers whatever period is looked at, as of today", async () => {
      const { repository, readStats } = setup();
      repository.addTask({ id: 1, status: "doing" });
      repository.addTask({ id: 2, status: "waiting" });
      // Overdue today; not yet overdue in the week of October 4.
      repository.addTask({ id: 3, status: "todo", due: october(10) });

      const thisWeek = await readStats({ scale: "week" });
      const weekOfOctober4 = await readStats({
        scale: "week",
        anchor: october(4),
      });

      const expected = { nextActions: 2, doing: 1, waiting: 1, overdue: 1 };
      expect(thisWeek.now).toEqual(expected);
      expect(weekOfOctober4.now).toEqual(expected);
    });
  });
});
