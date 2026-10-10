import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { MyDayUnreadableError } from "./my-day-unreadable-error";
import { createScheduleInMyDay } from "./schedule-in-my-day";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8,
// which runs from 5:00 on October 8 to 5:00 on October 9.
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
const oct8 = { day: { year: 2026, month: 10, day: 8 } };

describe("schedule in My Day", () => {
  it("schedules today's entry, snapped, in one write, past entries kept as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1 },
      { myDay: { kind: "readable", entries: [oct7Scheduled, oct8] } },
    );

    expect(
      await createScheduleInMyDay(deps(repository))(1, {
        start: at("08T14:07:00"),
        minutes: 50,
      }),
    ).toEqual({ kind: "changed" });
    expect(await repository.readMyDay(1)).toEqual({
      kind: "readable",
      entries: [
        {
          day: { year: 2026, month: 10, day: 7 },
          schedule: { start: at("07T09:00:00"), end: at("07T10:00:00") },
        },
        {
          day: { year: 2026, month: 10, day: 8 },
          schedule: { start: at("08T14:00:00"), end: at("08T14:45:00") },
        },
      ],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing when the snapped schedule is the one today's entry has", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 2 },
      {
        myDay: {
          kind: "readable",
          entries: [
            {
              day: { year: 2026, month: 10, day: 8 },
              schedule: { start: at("08T14:00:00"), end: at("08T15:00:00") },
            },
          ],
        },
      },
    );

    expect(
      await createScheduleInMyDay(deps(repository))(2, {
        start: at("08T14:05:00"),
        minutes: 60,
      }),
    ).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing when the task is not in today's My Day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 3 },
      { myDay: { kind: "readable", entries: [oct7Scheduled] } },
    );

    expect(
      await createScheduleInMyDay(deps(repository))(3, {
        start: at("08T14:00:00"),
        minutes: 60,
      }),
    ).toEqual({ kind: "unchanged" });
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses, writing nothing, when the task's My Day entries cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 4 },
      { myDay: { kind: "unreadable", reason: "unknown version 2" } },
    );

    await expect(
      createScheduleInMyDay(deps(repository))(4, {
        start: at("08T14:00:00"),
        minutes: 60,
      }),
    ).rejects.toThrow(MyDayUnreadableError);
    expect(repository.writeCount()).toBe(0);
  });

  it("leaves the start and due dates alone", async () => {
    const repository = createInMemoryTaskRepository();
    const oct10 = { year: 2026, month: 10, day: 10 };
    repository.addTask(
      { id: 5, start: oct10, due: oct10 },
      { myDay: { kind: "readable", entries: [oct8] } },
    );

    await createScheduleInMyDay(deps(repository))(5, {
      start: at("08T14:00:00"),
      minutes: 60,
    });

    const snapshot = await repository.readTaskGraph();
    const task = snapshot.tasks.find((item) => item.task.id === 5)?.task;
    expect(task?.start).toEqual({ year: 2026, month: 10, day: 10 });
    expect(task?.due).toEqual({ year: 2026, month: 10, day: 10 });
  });
});
