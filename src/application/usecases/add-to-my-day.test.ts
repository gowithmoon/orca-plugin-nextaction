import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { createAddToMyDay } from "./add-to-my-day";
import { MyDayUnreadableError } from "./my-day-unreadable-error";

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

    await expect(createAddToMyDay(deps(repository))(5)).rejects.toThrow(
      MyDayUnreadableError,
    );
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
