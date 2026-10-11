import { describe, expect, it } from "vitest";
import type {
  CompletionEntry,
  CompletionHistory,
  CompletionKind,
} from "../task/completion-history";
import type { TaskStatus } from "../task/task";
import type { DayBoundary } from "../time/logical-day";
import { type LookBackTask, lookBack, lookBackStart } from "./look-back";

// Runs in UTC+8 (pinned in vitest.config.ts); the times below are local.

const boundary: DayBoundary = { hours: 5, minutes: 0 };
const october = (day: number) => ({ year: 2026, month: 10, day });
const today = october(14);

describe("look back's start", () => {

  it("is when the last full review was completed", () => {
    const last = new Date("2026-10-09T23:30:00+08:00");

    expect(lookBackStart(last, today, boundary)).toEqual(last);
  });

  it("is the start of the logical day 7 days before today when no full review was completed or its moment is lost", () => {
    expect(lookBackStart(null, today, boundary)).toEqual(
      new Date("2026-10-07T05:00:00+08:00"),
    );
  });

  it("follows the day boundary the user set", () => {
    expect(lookBackStart(null, today, { hours: 0, minutes: 30 })).toEqual(
      new Date("2026-10-07T00:30:00+08:00"),
    );
  });

  it("counts calendar days across a month's end", () => {
    expect(
      lookBackStart(null, { year: 2026, month: 3, day: 3 }, boundary),
    ).toEqual(new Date("2026-02-24T05:00:00+08:00"));
  });
});

/** Look back from October 9, 23:30 (the logical day October 9). */
const start = new Date("2026-10-09T23:30:00+08:00");

/** An entry of the completion history at `at` (local, UTC+8). */
const entry = (
  at: string,
  day: number,
  kind?: CompletionKind,
): CompletionEntry => ({
  at: new Date(`${at}+08:00`),
  day: october(day),
  ...(kind && { kind }),
});

const task = (
  id: number,
  setup: {
    status?: TaskStatus;
    history?: CompletionHistory;
    /** The October days it has My Day entries on. */
    myDay?: readonly number[];
  } = {},
): LookBackTask<{ id: number; status: TaskStatus }> => ({
  task: { id, status: setup.status ?? "todo" },
  history: setup.history ?? [],
  myDay: (setup.myDay ?? []).map((day) => ({ day: october(day) })),
});

const read = (tasks: LookBackTask<{ id: number; status: TaskStatus }>[]) =>
  lookBack(tasks, { start, today, boundary });

describe("look back's completions and skips", () => {
  it("lists every completion and skip after the start, the latest first", () => {
    const { entries } = read([
      task(1, {
        status: "done",
        history: [
          // Before the start: not listed.
          entry("2026-10-09T23:00:00", 9),
          entry("2026-10-12T10:00:00", 12),
        ],
      }),
      task(2, {
        history: [
          entry("2026-10-10T08:00:00", 10, "skip"),
          entry("2026-10-13T08:00:00", 13),
        ],
      }),
    ]);

    expect(
      entries.map((item) => [item.task.id, item.kind, item.at.getDate()]),
    ).toEqual([
      [2, "completion", 13],
      [1, "completion", 12],
      [2, "skip", 10],
    ]);
  });

  it("lists a recurring task once for each time it was completed", () => {
    const { entries } = read([
      task(1, {
        history: [
          entry("2026-10-10T08:00:00", 10),
          entry("2026-10-11T08:00:00", 11),
          entry("2026-10-12T08:00:00", 12),
        ],
      }),
    ]);

    expect(entries.map((item) => item.at.getDate())).toEqual([12, 11, 10]);
  });

  it("lists nothing completed before the start or at it", () => {
    const { entries } = read([
      task(1, {
        history: [
          entry("2026-10-01T08:00:00", 1),
          { at: start, day: october(9) },
        ],
      }),
    ]);

    expect(entries).toEqual([]);
  });
});

describe("look back's planned but not done", () => {
  it("lists a task with a My Day entry from the start's logical day to yesterday that is still not done", () => {
    const { plannedNotDone } = read([
      // On the start's logical day, October 9.
      task(1, { myDay: [9] }),
      task(2, { status: "waiting", myDay: [13] }),
      // Before the start's logical day.
      task(3, { myDay: [8] }),
      task(4),
    ]);

    expect(plannedNotDone.map((item) => item.id)).toEqual([1, 2]);
  });

  it("does not list a recurring task completed on or after its entry's logical day, though it has advanced to todo", () => {
    const { plannedNotDone } = read([
      // In My Day October 10, completed October 11, advanced to todo.
      task(1, { myDay: [10], history: [entry("2026-10-11T20:00:00", 11)] }),
      // Completed on the entry's own logical day.
      task(2, { myDay: [12], history: [entry("2026-10-12T21:00:00", 12)] }),
      // Completed before the entry's day only: still not done.
      task(3, { myDay: [12], history: [entry("2026-10-10T20:00:00", 10)] }),
      // Skipped after it: a skip is not a completion.
      task(4, {
        myDay: [10],
        history: [entry("2026-10-11T20:00:00", 11, "skip")],
      }),
    ]);

    expect(plannedNotDone.map((item) => item.id)).toEqual([3, 4]);
  });

  it("does not list a done task", () => {
    const { plannedNotDone } = read([task(1, { status: "done", myDay: [10] })]);

    expect(plannedNotDone).toEqual([]);
  });

  it("does not list a task only for today's entry", () => {
    const { plannedNotDone } = read([task(1, { myDay: [14] })]);

    expect(plannedNotDone).toEqual([]);
  });

  it("lists a task once, however many past entries it has", () => {
    const { plannedNotDone } = read([task(1, { myDay: [9, 11, 13, 14] })]);

    expect(plannedNotDone.map((item) => item.id)).toEqual([1]);
  });

  it("counts a later entry not done though an earlier one was followed by a completion", () => {
    // In My Day October 10, completed October 11; in My Day again October 13
    // and not completed since.
    const { plannedNotDone } = read([
      task(1, {
        myDay: [10, 13],
        history: [entry("2026-10-11T20:00:00", 11)],
      }),
    ]);

    expect(plannedNotDone.map((item) => item.id)).toEqual([1]);
  });
});
