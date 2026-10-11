import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { MyDayEntry } from "../../domain/task/my-day";
import { createReadMyDay } from "./read-my-day";

// 2026-10-09 10:00 in UTC+8, the 5:00 boundary: the logical day 2026-10-09.
const morning = "2026-10-09T10:00:00+08:00";
const oct9 = { year: 2026, month: 10, day: 9 };
const oct8 = { year: 2026, month: 10, day: 8 };
const at = (time: string) => new Date(`2026-10-${time}+08:00`);

/** The task's My Day entries, readable. */
const myDay = (...entries: MyDayEntry[]) => ({
  myDay: { kind: "readable" as const, entries },
});

function setup() {
  const repository = createInMemoryTaskRepository();
  const dayBoundary = createFixedDayBoundary();
  const readMyDay = createReadMyDay({
    repository,
    clock: createFixedClock(morning),
    dayBoundary,
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, dayBoundary, readMyDay };
}

describe("read today's My Day", () => {
  it("lists only the tasks with an entry on today, not those with past ones only", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask({ id: 1, status: "todo" }, myDay({ day: oct9 }));
    repository.addTask({ id: 2, status: "todo" }, myDay({ day: oct8 }));
    repository.addTask({ id: 3, status: "todo" });
    repository.addTask(
      { id: 4, status: "waiting" },
      myDay({ day: oct8 }, { day: oct9 }),
    );

    const read = await readMyDay();

    expect(read.unscheduled.map((item) => item.task.id).sort()).toEqual([1, 4]);
    expect(read.scheduled).toEqual([]);
  });

  it("lists the unscheduled highest score first, done ones after the others", async () => {
    const { repository, readMyDay } = setup();
    repository.addTask(
      { id: 1, status: "todo", importance: 2 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 2, status: "done", importance: 7, due: oct9 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 3, status: "waiting", due: oct9 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 4, status: "done", importance: 1 },
      myDay({ day: oct9 }),
    );
    repository.addTask({ id: 5, status: "todo" }, myDay({ day: oct9 }));

    const read = await readMyDay();

    expect(read.unscheduled.map((item) => item.task.id)).toEqual([
      3, 5, 1, 2, 4,
    ]);
  });

  it("lists the scheduled by start, each with its schedule, apart from the unscheduled", async () => {
    const { repository, readMyDay } = setup();
    const afternoon = { start: at("09T14:00:00"), end: at("09T15:00:00") };
    const earlyMorning = { start: at("09T06:00:00"), end: at("09T06:30:00") };
    repository.addTask(
      { id: 1, status: "todo" },
      myDay({ day: oct9, schedule: afternoon }),
    );
    repository.addTask({ id: 2, status: "todo" }, myDay({ day: oct9 }));
    repository.addTask(
      { id: 3, status: "done" },
      myDay({ day: oct9, schedule: earlyMorning }),
    );

    const read = await readMyDay();

    expect(read.scheduled.map((item) => [item.task.id, item.schedule])).toEqual(
      [
        [3, earlyMorning],
        [1, afternoon],
      ],
    );
    expect(read.unscheduled.map((item) => item.task.id)).toEqual([2]);
  });

  it("gives every task its place in the unscheduled order, the scheduled ones too", async () => {
    const { repository, readMyDay } = setup();
    const schedule = { start: at("09T14:00:00"), end: at("09T15:00:00") };
    repository.addTask(
      { id: 1, status: "todo", importance: 2 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 2, status: "todo", importance: 7 },
      myDay({ day: oct9, schedule }),
    );
    repository.addTask(
      { id: 3, status: "done", importance: 7 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 4, status: "todo" },
      myDay({ day: oct9, schedule }),
    );

    const read = await readMyDay();

    expect(
      [...read.scheduled, ...read.unscheduled]
        .map((item) => [item.task.id, item.unscheduledOrder])
        .sort(([a], [b]) => Number(a) - Number(b)),
    ).toEqual([
      [1, 2],
      [2, 0],
      [3, 3],
      [4, 1],
    ]);
  });

  it("lists the scheduled starting at the same time in the unscheduled order", async () => {
    const { repository, readMyDay } = setup();
    const schedule = { start: at("09T14:00:00"), end: at("09T15:00:00") };
    repository.addTask(
      { id: 1, status: "todo", importance: 2 },
      myDay({ day: oct9, schedule }),
    );
    repository.addTask(
      { id: 2, status: "todo", importance: 7 },
      myDay({ day: oct9, schedule }),
    );

    const read = await readMyDay();

    expect(read.scheduled.map((item) => item.task.id)).toEqual([2, 1]);
  });

  it("says the time range of today it read by, from the day boundary to the next one", async () => {
    const { dayBoundary, readMyDay } = setup();
    expect((await readMyDay()).range).toEqual({
      start: at("09T05:00:00"),
      end: at("10T05:00:00"),
    });
    dayBoundary.set({ hours: 6, minutes: 30 });
    expect((await readMyDay()).range).toEqual({
      start: at("09T06:30:00"),
      end: at("10T06:30:00"),
    });
  });

  it("reads a schedule outside today's range as unscheduled, after the day boundary moved", async () => {
    const { repository, dayBoundary, readMyDay } = setup();
    // Scheduled 5:00–6:00 under the 5:00 boundary; the user then set 6:00.
    repository.addTask(
      { id: 1, status: "todo" },
      myDay({
        day: oct9,
        schedule: { start: at("09T05:00:00"), end: at("09T06:00:00") },
      }),
    );
    dayBoundary.set({ hours: 6, minutes: 0 });

    const read = await readMyDay();

    expect(read.scheduled).toEqual([]);
    expect(read.unscheduled.map((item) => item.task.id)).toEqual([1]);
  });

  it("marks the tasks still not done after their due day as overdue, scheduled or not", async () => {
    const { repository, readMyDay } = setup();
    const schedule = { start: at("09T14:00:00"), end: at("09T15:00:00") };
    repository.addTask(
      { id: 1, status: "todo", due: oct8 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 2, status: "todo", due: oct8 },
      myDay({ day: oct9, schedule }),
    );
    repository.addTask(
      { id: 3, status: "done", due: oct8 },
      myDay({ day: oct9 }),
    );
    repository.addTask(
      { id: 4, status: "todo", due: oct9 },
      myDay({ day: oct9 }),
    );

    const read = await readMyDay();

    expect(
      [...read.scheduled, ...read.unscheduled]
        .map((item) => [item.task.id, item.overdue])
        .sort(([a], [b]) => Number(a) - Number(b)),
    ).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ]);
  });
});
