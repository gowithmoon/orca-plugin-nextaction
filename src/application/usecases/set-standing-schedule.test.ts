import { describe, expect, it } from "vitest";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import {
  createSetStandingSchedule,
  StandingScheduleRefusedError,
} from "./set-standing-schedule";

// Setting a standing schedule (GLOSSARY: 常设排期), with the 5:00 boundary.
const weekdays = {
  kind: "rule",
  rule: { period: { interval: 1, unit: "weekday" }, basis: "schedule" },
} as const;
const time = (hours: number, minutes = 0) => ({ hours, minutes });
const standup = { start: time(8, 45), end: time(9, 15) };

function setup() {
  const repository = createInMemoryTaskRepository();
  const setStandingSchedule = createSetStandingSchedule({
    repository,
    dayBoundary: createFixedDayBoundary(),
  });
  return { repository, setStandingSchedule };
}

const standingOf = async (repository: InMemoryTaskRepository, id: number) =>
  (await repository.getTask(id))?.standingSchedule;

describe("set standing schedule", () => {
  it("sets, changes and clears a recurring task's standing schedule, each in one write", async () => {
    const { repository, setStandingSchedule } = setup();
    repository.addTask({ id: 1, status: "todo", recurrence: weekdays });

    await setStandingSchedule(1, standup);
    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: standup,
    });
    const report = { start: time(17, 30), end: time(18) };
    await setStandingSchedule(1, report);
    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: report,
    });
    await setStandingSchedule(1, null);
    expect(await standingOf(repository, 1)).toEqual({ kind: "none" });
    expect(repository.writeCount()).toBe(3);
  });

  it("refuses a task without a recurrence rule, writing nothing", async () => {
    const { repository, setStandingSchedule } = setup();
    repository.addTask({ id: 1, status: "todo" });

    await expect(setStandingSchedule(1, standup)).rejects.toEqual(
      new StandingScheduleRefusedError("not-recurring"),
    );
    expect(repository.writeCount()).toBe(0);
  });

  it.each([
    ["crosses-day-boundary", { start: time(4), end: time(6) }],
    ["crosses-day-boundary", { start: time(23), end: time(5, 15) }],
    ["empty", { start: time(9), end: time(9) }],
    ["off-step", { start: time(8, 40), end: time(9, 15) }],
  ] as const)(
    "refuses times that are %s, writing nothing",
    async (problem, schedule) => {
      const { repository, setStandingSchedule } = setup();
      repository.addTask({ id: 1, status: "todo", recurrence: weekdays });

      await expect(setStandingSchedule(1, schedule)).rejects.toEqual(
        new StandingScheduleRefusedError(problem),
      );
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("takes times before the day boundary, at the end of the logical day, up to the boundary itself", async () => {
    const { repository, setStandingSchedule } = setup();
    repository.addTask({ id: 1, status: "todo", recurrence: weekdays });

    await setStandingSchedule(1, { start: time(22), end: time(2) });
    await setStandingSchedule(1, { start: time(1), end: time(5) });

    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: { start: time(1), end: time(5) },
    });
  });

  it("writes nothing over a standing schedule this plugin cannot read", async () => {
    const { repository, setStandingSchedule } = setup();
    repository.addTask({
      id: 1,
      status: "todo",
      recurrence: weekdays,
      standingSchedule: { kind: "unreadable", reason: "unknown version 2" },
    });

    await expect(setStandingSchedule(1, standup)).rejects.toThrow();
    await expect(setStandingSchedule(1, null)).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });

  it("keeps the day it was removed from My Day on when the times change, so it stays out today (#245)", async () => {
    const { repository, setStandingSchedule } = setup();
    const removedOn = { year: 2026, month: 10, day: 9 };
    repository.addTask({
      id: 1,
      status: "todo",
      recurrence: weekdays,
      standingSchedule: {
        kind: "schedule",
        schedule: { ...standup, removedOn },
      },
    });
    const report = { start: time(17, 30), end: time(18) };

    await setStandingSchedule(1, report);

    expect(await standingOf(repository, 1)).toEqual({
      kind: "schedule",
      schedule: { ...report, removedOn },
    });
  });
});
