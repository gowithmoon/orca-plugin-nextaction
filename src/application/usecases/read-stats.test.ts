import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
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
});
