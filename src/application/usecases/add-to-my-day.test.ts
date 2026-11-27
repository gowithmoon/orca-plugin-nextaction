import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { createAddToMyDay } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import { createReadMyDay } from "./read-my-day";
import { createRemoveFromMyDay } from "./remove-from-my-day";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8.
const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  clock: createFixedClock("2026-10-09T02:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

const oct7Scheduled = {
  day: { year: 2026, month: 10, day: 7 },
  schedule: {
    start: new Date("2026-10-07T09:00:00+08:00"),
    end: new Date("2026-10-07T10:00:00+08:00"),
  },
};

describe("add to My Day", () => {
  it("adds the task to today's My Day, unscheduled, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });

    expect(await createAddToMyDay(deps(repository))(1)).toEqual({
      kind: "changed",
    });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [{ day: { year: 2026, month: 10, day: 8 } }],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("keeps the past entries as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 2 },
      { myDay: { kind: "readable", entries: [oct7Scheduled] } },
    );

    await createAddToMyDay(deps(repository))(2);

    expect(await repository.readMyDay(2)).toEqual({
      kind: "readable",
      entries: [
        {
          day: { year: 2026, month: 10, day: 7 },
          schedule: {
            start: new Date("2026-10-07T09:00:00+08:00"),
            end: new Date("2026-10-07T10:00:00+08:00"),
          },
        },
        { day: { year: 2026, month: 10, day: 8 } },
      ],
    });
  });

  it("writes nothing when the task is already in today's My Day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 3 },
      {
        myDay: {
          kind: "readable",
          entries: [{ day: { year: 2026, month: 10, day: 8 } }],
        },
      },
    );

    expect(await createAddToMyDay(deps(repository))(3)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("adds a done task too", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 4, status: "done" });

    expect(await createAddToMyDay(deps(repository))(4)).toEqual({
      kind: "changed",
    });
  });

  it("refuses, writing nothing, when the task's My Day entries cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 5 },
      { myDay: { kind: "unreadable", reason: "unknown version 2" } },
    );

    const refused = createAddToMyDay(deps(repository))(5);
    await expect(refused).rejects.toThrow(MyDayUnreadableError);
    // Why, for the user's notice (#81).
    await expect(refused).rejects.toMatchObject({
      reason: "unknown version 2",
    });
    expect(repository.writeCount()).toBe(0);
    expect(await repository.readMyDay(5)).toEqual({
      kind: "unreadable",
      reason: "unknown version 2",
    });
  });

  it("throws when the write fails", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 6 });
    const failure = new Error("no note panel");
    repository.failWrites(failure);

    await expect(createAddToMyDay(deps(repository))(6)).rejects.toBe(failure);
    expect(await repository.readMyDay(6)).toEqual({
      kind: "readable",
      entries: [],
    });
  });
});

// A daily stand-up its standing schedule (GLOSSARY: 常设排期) would bring
// into today, Thursday October 8, had the user not removed it today (#245).
const oct8 = { year: 2026, month: 10, day: 8 };
const standup = {
  start: { hours: 8, minutes: 45 },
  end: { hours: 9, minutes: 15 },
};
const standingTask = (id: number, removedOn?: typeof oct8) =>
  ({
    id,
    status: "todo",
    due: oct8,
    recurrence: {
      kind: "rule",
      rule: { period: { interval: 1, unit: "day" }, basis: "schedule" },
    },
    standingSchedule: {
      kind: "schedule",
      schedule: { ...standup, ...(removedOn && { removedOn }) },
    },
  }) as const;

describe("add to My Day, with a standing schedule", () => {
  it("adds back one removed today by clearing the mark in one write, writing no entry", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(standingTask(1, oct8));

    expect(await createAddToMyDay(deps(repository))(1)).toEqual({
      kind: "changed",
    });
    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: standup,
    });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("puts one removed and added back today at its standing schedule again, even after it was moved", async () => {
    const repository = createInMemoryTaskRepository();
    // Moved to 14:00–15:00 today on the timeline, then removed and added back.
    repository.addTask(standingTask(1), {
      myDay: {
        kind: "readable",
        entries: [
          {
            day: oct8,
            schedule: {
              start: new Date("2026-10-08T14:00:00+08:00"),
              end: new Date("2026-10-08T15:00:00+08:00"),
            },
          },
        ],
      },
    });
    await createRemoveFromMyDay(deps(repository))(1);
    await createAddToMyDay(deps(repository))(1);

    const read = await createReadMyDay({
      ...deps(repository),
      startPreviewDays: createFixedStartPreviewDays(),
    })();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [
        [
          1,
          {
            start: new Date("2026-10-08T08:45:00+08:00"),
            end: new Date("2026-10-08T09:15:00+08:00"),
          },
        ],
      ],
    );
  });

  it("writes nothing for one its standing schedule brings in: it is in today already", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(standingTask(1));

    expect(await createAddToMyDay(deps(repository))(1)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("also writes an entry when clearing the mark would not bring it back, its date moved past today", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      ...standingTask(1, oct8),
      due: { year: 2026, month: 10, day: 9 },
    });

    await createAddToMyDay(deps(repository))(1);

    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: standup,
    });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [{ day: oct8 }],
    });
    expect(repository.writeCount()).toBe(1);
  });
});
