import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import { createUnscheduleInMyDay } from "./unschedule-in-my-day";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8.
const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  clock: createFixedClock("2026-10-09T02:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});
const at = (time: string) => new Date(`2026-10-${time}+08:00`);

const oct7Scheduled = {
  day: { year: 2026, month: 10, day: 7 },
  schedule: { start: at("07T09:00:00"), end: at("07T10:00:00") },
};
const oct8Scheduled = {
  day: { year: 2026, month: 10, day: 8 },
  schedule: { start: at("08T14:00:00"), end: at("08T15:00:00") },
};

describe("unschedule in My Day", () => {
  it("unschedules today's entry in one write, keeping it in My Day and past entries as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1 },
      { myDay: { kind: "readable", entries: [oct7Scheduled, oct8Scheduled] } },
    );

    expect(await createUnscheduleInMyDay(deps(repository))(1)).toEqual({
      kind: "changed",
    });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [
        {
          day: { year: 2026, month: 10, day: 7 },
          schedule: { start: at("07T09:00:00"), end: at("07T10:00:00") },
        },
        { day: { year: 2026, month: 10, day: 8 } },
      ],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing when today's entry is unscheduled already", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 2 },
      {
        myDay: {
          kind: "readable",
          entries: [oct7Scheduled, { day: { year: 2026, month: 10, day: 8 } }],
        },
      },
    );

    expect(await createUnscheduleInMyDay(deps(repository))(2)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing when the task is not in today's My Day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 3 },
      { myDay: { kind: "readable", entries: [oct7Scheduled] } },
    );

    expect(await createUnscheduleInMyDay(deps(repository))(3)).toEqual({
      kind: "unchanged",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses, writing nothing, when the task's My Day entries cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 4 },
      { myDay: { kind: "unreadable", reason: "unknown version 2" } },
    );

    await expect(createUnscheduleInMyDay(deps(repository))(4)).rejects.toThrow(
      MyDayUnreadableError,
    );
    expect(repository.writeCount()).toBe(0);
  });
});
