import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
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
const oct8Scheduled = {
  day: { year: 2026, month: 10, day: 8 },
  schedule: {
    start: new Date("2026-10-08T14:00:00+08:00"),
    end: new Date("2026-10-08T15:00:00+08:00"),
  },
};

describe("remove from My Day", () => {
  it("removes only today's entry in one write, past entries kept as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1 },
      { myDay: { kind: "readable", entries: [oct7Scheduled, oct8Scheduled] } },
    );

    expect(await createRemoveFromMyDay(deps(repository))(1)).toEqual({
      kind: "changed",
    });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [
        {
          day: { year: 2026, month: 10, day: 7 },
          schedule: {
            start: new Date("2026-10-07T09:00:00+08:00"),
            end: new Date("2026-10-07T10:00:00+08:00"),
          },
        },
      ],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes no entries when today's was the last one", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 2 },
      { myDay: { kind: "readable", entries: [oct8Scheduled] } },
    );

    await createRemoveFromMyDay(deps(repository))(2);

    expect(await repository.readMyDay(2)).toEqual({
      kind: "readable",
      entries: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing when the task is not in today's My Day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 3 },
      { myDay: { kind: "readable", entries: [oct7Scheduled] } },
    );

    expect(await createRemoveFromMyDay(deps(repository))(3)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses, writing nothing, when the task's My Day entries cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 4 },
      {
        myDay: { kind: "unreadable", reason: "entry 0 is not a My Day entry" },
      },
    );

    await expect(createRemoveFromMyDay(deps(repository))(4)).rejects.toThrow(
      MyDayUnreadableError,
    );
    expect(repository.writeCount()).toBe(0);
  });
});

// A daily stand-up its standing schedule (GLOSSARY: 常设排期) brings into
// today, Thursday October 8 (ADR 0029).
const oct8 = { year: 2026, month: 10, day: 8 };
const standup = {
  start: { hours: 8, minutes: 45 },
  end: { hours: 9, minutes: 15 },
};
const standingTask = (id: number, due = oct8) =>
  ({
    id,
    status: "todo",
    due,
    recurrence: {
      kind: "rule",
      rule: { period: { interval: 1, unit: "day" }, basis: "schedule" },
    },
    standingSchedule: { kind: "schedule", schedule: standup },
  }) as const;

describe("remove from My Day, with a standing schedule", () => {
  it("marks it removed today on its standing schedule in one write, so today it is not brought in", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(standingTask(1));

    expect(await createRemoveFromMyDay(deps(repository))(1)).toEqual({
      kind: "changed",
    });
    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("deletes today's entry of one already moved on the timeline and marks it removed, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(standingTask(1), {
      myDay: { kind: "readable", entries: [oct7Scheduled, oct8Scheduled] },
    });

    await createRemoveFromMyDay(deps(repository))(1);

    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [oct7Scheduled],
    });
    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("marks one completed today removed too: it would stay in today as done", async () => {
    const repository = createInMemoryTaskRepository();
    // Completed this morning, advanced to tomorrow.
    repository.addTask(standingTask(1, { year: 2026, month: 10, day: 9 }), {
      completionHistory: {
        kind: "readable",
        history: [{ at: new Date("2026-10-08T09:00:00+08:00"), day: oct8 }],
      },
    });

    await createRemoveFromMyDay(deps(repository))(1);

    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: { ...standup, removedOn: oct8 },
    });
  });

  it("only deletes today's entry when its standing schedule would not bring it in today", async () => {
    const repository = createInMemoryTaskRepository();
    // Not to do until tomorrow; added by hand today.
    repository.addTask(standingTask(1, { year: 2026, month: 10, day: 9 }), {
      myDay: { kind: "readable", entries: [oct8Scheduled] },
    });

    await createRemoveFromMyDay(deps(repository))(1);

    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [],
    });
    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: standup,
    });
  });

  it("writes nothing when it was removed today already", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      ...standingTask(1),
      standingSchedule: {
        kind: "schedule",
        schedule: { ...standup, removedOn: oct8 },
      },
    });

    expect(await createRemoveFromMyDay(deps(repository))(1)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });
});
