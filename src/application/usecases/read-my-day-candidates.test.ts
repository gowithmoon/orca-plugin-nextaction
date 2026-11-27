import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { matchesSearch } from "../../domain/task/task-search";
import { createReadMyDayCandidates } from "./read-my-day-candidates";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8.
const night = "2026-10-09T02:00:00+08:00";
const oct8 = { year: 2026, month: 10, day: 8 };
const oct7 = { year: 2026, month: 10, day: 7 };

describe("read My Day candidates", () => {
  it("offers every task not in today's My Day, done ones included, with its text", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Write the report", status: "todo" });
    repository.addTask(
      { id: 2, text: "Call the plumber", status: "waiting" },
      { myDay: { kind: "readable", entries: [{ day: oct8 }] } },
    );
    repository.addTask({ id: 3, text: "Buy parts", status: "done" });
    repository.addTask(
      { id: 4, text: "Clear the cupboard", status: "someday" },
      { myDay: { kind: "readable", entries: [{ day: oct7 }] } },
    );
    repository.addBlock(5, { text: "Not a task" });
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(await readMyDayCandidates()).toEqual([
      { id: 1, text: "Write the report", searchText: "" },
      { id: 3, text: "Buy parts", searchText: "" },
      { id: 4, text: "Clear the cupboard", searchText: "" },
    ]);
  });

  it("leaves out a task whose My Day entries cannot be read: it cannot be added", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Write the report", status: "todo" });
    repository.addTask(
      { id: 2, text: "Call the plumber", status: "todo" },
      { myDay: { kind: "unreadable", reason: "unknown version 9" } },
    );
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(await readMyDayCandidates()).toEqual([
      { id: 1, text: "Write the report", searchText: "" },
    ]);
  });

  it("offers each candidate with its search text, so a search finds the values in it as well as the text", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      text: "Write the report",
      searchText: "Write the report #Task,Todo,Zhang San\n",
    });
    repository.addTask({ id: 2, text: "Ask Zhang for the report" });
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    const found = (await readMyDayCandidates()).filter((candidate) =>
      matchesSearch("zhang report", candidate),
    );

    expect(found.map((candidate) => candidate.id)).toEqual([1, 2]);
  });

  it("leaves out a task its standing schedule brings into today (GLOSSARY: 常设排期)", async () => {
    const repository = createInMemoryTaskRepository();
    const recurring = {
      status: "todo",
      recurrence: {
        kind: "rule",
        rule: { period: { interval: 1, unit: "day" }, basis: "schedule" },
      },
      standingSchedule: {
        kind: "schedule",
        schedule: {
          start: { hours: 8, minutes: 45 },
          end: { hours: 9, minutes: 15 },
        },
      },
    } as const;
    repository.addTask({ id: 1, text: "Stand-up", due: oct8, ...recurring });
    // Not yet to do today: offered.
    repository.addTask({
      id: 2,
      text: "Weekly report",
      due: { year: 2026, month: 10, day: 9 },
      ...recurring,
    });
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(
      (await readMyDayCandidates()).map((candidate) => candidate.id),
    ).toEqual([2]);
  });

  it("offers a task its standing schedule would bring in but the user removed from today's My Day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      text: "Stand-up",
      status: "todo",
      due: oct8,
      recurrence: {
        kind: "rule",
        rule: { period: { interval: 1, unit: "day" }, basis: "schedule" },
      },
      standingSchedule: {
        kind: "schedule",
        schedule: {
          start: { hours: 8, minutes: 45 },
          end: { hours: 9, minutes: 15 },
          removedOn: oct8,
        },
      },
    });
    const readMyDayCandidates = createReadMyDayCandidates({
      repository,
      clock: createFixedClock(night),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(
      (await readMyDayCandidates()).map((candidate) => candidate.id),
    ).toEqual([1]);
  });
});
