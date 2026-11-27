import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { createChangeStatus } from "./change-status";
import { createReadMyDay } from "./read-my-day";
import { createSetRecurrence } from "./set-recurrence";
import { StandingScheduleRefusedError } from "./set-standing-schedule";

const everyTwoWeeks = {
  period: { interval: 2, unit: "week" },
  basis: "schedule",
} as const;

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Thursday October 8, 2026.
  clock: createFixedClock("2026-10-08T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("set recurrence", () => {
  it("writes the rule in one write, leaving the task's dates as they are", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 16 };
    const start = { year: 2026, month: 10, day: 13 };
    repository.addTask({ id: 1, status: "todo", start, due });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, everyTwoWeeks);

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "todo",
      start,
      due,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("after the rule is removed, completing the task leaves it done", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 16 };
    repository.addTask({
      id: 2,
      status: "todo",
      due,
      recurrence: { kind: "rule", rule: everyTwoWeeks },
    });
    const setRecurrence = createSetRecurrence(deps(repository));
    const changeStatus = createChangeStatus({
      repository,
      clock: createFixedClock("2026-10-08T09:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    await setRecurrence(2, null);
    expect(await changeStatus(2, "done")).toEqual({ kind: "changed" });

    expect(await repository.getTask(2)).toMatchObject({
      recurrence: { kind: "none" },
      status: "done",
      due,
    });
  });

  it("resuming the rule of a done task advances it in the same write, recording nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const completed = {
      at: new Date("2026-10-01T01:00:00.000Z"),
      day: { year: 2026, month: 10, day: 1 },
    };
    repository.addTask(
      {
        id: 4,
        status: "done",
        due: { year: 2026, month: 10, day: 2 },
        recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
      },
      { completionHistory: { kind: "readable", history: [completed] } },
    );
    const setRecurrence = createSetRecurrence({
      repository,
      clock: createFixedClock("2026-10-08T09:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
    });

    expect(await setRecurrence(4, everyTwoWeeks)).toEqual({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 16 },
      resumedOn: { year: 2026, month: 10, day: 8 },
    });

    expect(await repository.getTask(4)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "todo",
      due: { year: 2026, month: 10, day: 16 },
    });
    expect(await repository.readCompletionHistory(4)).toEqual({
      kind: "readable",
      history: [completed],
    });
    // Rule, status and date in one write, so one undo.
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task uses up one of the remaining occurrences, in the same write (#89)", async () => {
    const repository = createInMemoryTaskRepository();
    const counted = {
      ...everyTwoWeeks,
      end: { kind: "count", total: 5, remaining: 3 },
    } as const;
    repository.addTask({
      id: 14,
      status: "done",
      due: { year: 2026, month: 10, day: 2 },
      recurrence: { kind: "rule", rule: { ...counted, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(14, counted)).toMatchObject({
      kind: "advanced",
      next: { year: 2026, month: 10, day: 16 },
    });

    expect(await repository.getTask(14)).toMatchObject({
      status: "todo",
      recurrence: {
        kind: "rule",
        rule: { ...counted, end: { kind: "count", total: 5, remaining: 2 } },
      },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task on its last occurrence ends the recurrence: done, the rule removed (#89)", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    const lastOne = {
      ...everyTwoWeeks,
      end: { kind: "count", total: 5, remaining: 1 },
    } as const;
    repository.addTask({
      id: 15,
      status: "done",
      due,
      recurrence: { kind: "rule", rule: { ...lastOne, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(15, lastOne)).toEqual({ kind: "ended" });

    expect(await repository.getTask(15)).toMatchObject({
      status: "done",
      due,
      recurrence: { kind: "none" },
    });
    expect(await repository.readCompletionHistory(15)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a task not done writes only the rule", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    repository.addTask({
      id: 5,
      status: "doing",
      due,
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(5, everyTwoWeeks)).toEqual({ kind: "set" });

    expect(await repository.getTask(5)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      status: "doing",
      due,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("resuming the rule of a done task brings its done descendant tasks back to todo in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 6,
      status: "done",
      due: { year: 2026, month: 10, day: 2 },
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
    });
    repository.addTask(
      { id: 7, status: "done", due: { year: 2026, month: 10, day: 1 } },
      { parentId: 6 },
    );
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(6, everyTwoWeeks);

    // Moved by the fourteen days the task moved.
    expect(await repository.getTask(7)).toMatchObject({
      status: "todo",
      due: { year: 2026, month: 10, day: 15 },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("pausing the rule of a done task writes only the rule", async () => {
    const repository = createInMemoryTaskRepository();
    const due = { year: 2026, month: 10, day: 2 };
    repository.addTask({
      id: 8,
      status: "done",
      due,
      recurrence: { kind: "rule", rule: everyTwoWeeks },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(8, { ...everyTwoWeeks, paused: true })).toEqual({
      kind: "set",
    });

    expect(await repository.getTask(8)).toMatchObject({
      recurrence: { kind: "rule", rule: { ...everyTwoWeeks, paused: true } },
      status: "done",
      due,
    });
  });

  it("refuses to overwrite a rule it cannot read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "unreadable", reason: "unknown version 2" } as const;
    repository.addTask({ id: 3, recurrence: stored });
    const setRecurrence = createSetRecurrence(deps(repository));

    await expect(setRecurrence(3, everyTwoWeeks)).rejects.toThrow();
    expect((await repository.getTask(3))?.recurrence).toEqual(stored);
    expect(repository.writeCount()).toBe(0);
  });
});

describe("set recurrence with a standing schedule (GLOSSARY: 常设排期)", () => {
  const standup = {
    start: { hours: 8, minutes: 45 },
    end: { hours: 9, minutes: 15 },
  };

  it("writes the standing schedule with the rule, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, everyTwoWeeks, standup);

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: { kind: "schedule", schedule: standup },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("keeps the day it was removed from My Day on when the standing schedule's times change (#245)", async () => {
    const repository = createInMemoryTaskRepository();
    const removedOn = { year: 2026, month: 10, day: 8 };
    repository.addTask({
      id: 1,
      status: "todo",
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: {
        kind: "schedule",
        schedule: {
          start: { hours: 17, minutes: 30 },
          end: { hours: 18, minutes: 0 },
          removedOn,
        },
      },
    });

    await createSetRecurrence(deps(repository))(1, everyTwoWeeks, standup);

    expect((await repository.getTask(1))?.standingSchedule).toEqual({
      kind: "schedule",
      schedule: { ...standup, removedOn },
    });
  });

  it("leaves the standing schedule as it is when none is given", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "schedule", schedule: standup } as const;
    repository.addTask({
      id: 1,
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: stored,
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, { ...everyTwoWeeks, basis: "completion" });

    expect((await repository.getTask(1))?.standingSchedule).toEqual(stored);
  });

  it("refuses a standing schedule it cannot save, writing neither", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo" });
    const setRecurrence = createSetRecurrence(deps(repository));
    // 4:00–6:00 crosses the 5:00 boundary.
    const crossing = {
      start: { hours: 4, minutes: 0 },
      end: { hours: 6, minutes: 0 },
    };

    await expect(setRecurrence(1, everyTwoWeeks, crossing)).rejects.toEqual(
      new StandingScheduleRefusedError("crosses-day-boundary"),
    );
    await expect(setRecurrence(1, null, standup)).rejects.toEqual(
      new StandingScheduleRefusedError("not-recurring"),
    );
    expect(repository.writeCount()).toBe(0);
  });

  it("removing the rule removes the standing schedule, in the same write (#246)", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "todo",
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: { kind: "schedule", schedule: standup },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, null);

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "none" },
      standingSchedule: { kind: "none" },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("removing the rule leaves a standing schedule it cannot read as it is (#246)", async () => {
    const repository = createInMemoryTaskRepository();
    const unreadable = {
      kind: "unreadable",
      reason: "unknown version 2",
    } as const;
    repository.addTask({
      id: 1,
      status: "todo",
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: unreadable,
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    await setRecurrence(1, null);

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "none" },
      standingSchedule: unreadable,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("pausing keeps the standing schedule; resumed, it brings the task into today again (#246)", async () => {
    const repository = createInMemoryTaskRepository();
    const stored = { kind: "schedule", schedule: standup } as const;
    repository.addTask({
      id: 1,
      status: "todo",
      due: { year: 2026, month: 10, day: 8 },
      recurrence: { kind: "rule", rule: everyTwoWeeks },
      standingSchedule: stored,
    });
    const setRecurrence = createSetRecurrence(deps(repository));
    const readMyDay = createReadMyDay({
      ...deps(repository),
      startPreviewDays: createFixedStartPreviewDays(),
    });
    const todays = async () =>
      (await readMyDay()).scheduled.map((item) => item.task.id);

    await setRecurrence(1, { ...everyTwoWeeks, paused: true });
    expect((await repository.getTask(1))?.standingSchedule).toEqual(stored);
    expect(await todays()).toEqual([]);

    await setRecurrence(1, everyTwoWeeks);
    expect((await repository.getTask(1))?.standingSchedule).toEqual(stored);
    expect(await todays()).toEqual([1]);
  });

  it("resuming on the last occurrence removes the standing schedule with the rule, in the same write (#246)", async () => {
    const repository = createInMemoryTaskRepository();
    const lastOne = {
      ...everyTwoWeeks,
      end: { kind: "count", total: 5, remaining: 1 },
    } as const;
    repository.addTask({
      id: 1,
      status: "done",
      due: { year: 2026, month: 10, day: 2 },
      recurrence: { kind: "rule", rule: { ...lastOne, paused: true } },
      standingSchedule: { kind: "schedule", schedule: standup },
    });
    const setRecurrence = createSetRecurrence(deps(repository));

    expect(await setRecurrence(1, lastOne, standup)).toEqual({ kind: "ended" });

    expect(await repository.getTask(1)).toMatchObject({
      recurrence: { kind: "none" },
      standingSchedule: { kind: "none" },
    });
    expect(repository.writeCount()).toBe(1);
  });
});
