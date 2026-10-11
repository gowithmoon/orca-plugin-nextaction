import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import type { Task } from "../../domain/task/task";
import {
  CompletionHistoryUnreadableError,
  RecurrenceUnreadableError,
} from "./change-status";
import {
  createCanSkipOccurrence,
  createSkipOccurrence,
  NotSkippableError,
} from "./skip-occurrence";

const weekly = {
  period: { interval: 1, unit: "week" },
  basis: "schedule",
} as const;

const oct12 = { year: 2026, month: 10, day: 12 };
const oct14 = { year: 2026, month: 10, day: 14 };
const oct19 = { year: 2026, month: 10, day: 19 };

const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  // Wednesday October 14, 2026, 09:00 in UTC+8.
  clock: createFixedClock("2026-10-14T09:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

describe("skip this occurrence of a recurring task (#91)", () => {
  it("records a skip and advances the task, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 1,
      status: "doing",
      due: oct12,
      recurrence: { kind: "rule", rule: weekly },
    });
    const skip = createSkipOccurrence(deps(repository));

    expect(await skip(1)).toEqual({ next: oct19, skippedOn: oct14 });

    expect(await repository.getTask(1)).toMatchObject({
      status: "todo",
      due: oct19,
    });
    expect(await repository.readCompletionHistory(1)).toEqual({
      kind: "readable",
      history: [
        { at: new Date("2026-10-14T09:00:00+08:00"), day: oct14, kind: "skip" },
      ],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("uses up one of the remaining occurrences and resets done descendant tasks, in the same write", async () => {
    const repository = createInMemoryTaskRepository();
    const rule = {
      ...weekly,
      end: { kind: "count", total: 5, remaining: 3 },
    } as const;
    repository.addTask({
      id: 1,
      status: "waiting",
      due: oct12,
      recurrence: { kind: "rule", rule },
    } as const);
    repository.addTask({ id: 2, status: "done", due: oct12 }, { parentId: 1 });
    const skip = createSkipOccurrence(deps(repository));

    await skip(1);

    expect((await repository.getTask(1))?.recurrence).toEqual({
      kind: "rule",
      rule: { ...weekly, end: { kind: "count", total: 5, remaining: 2 } },
    });
    expect(await repository.getTask(2)).toMatchObject({
      status: "todo",
      due: oct19,
    });
    expect(await repository.readCompletionHistory(2)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it.each([
    [
      "is done",
      {
        status: "done",
        due: oct12,
        recurrence: { kind: "rule", rule: weekly },
      },
      "done",
    ],
    [
      "has a paused rule",
      {
        status: "todo",
        due: oct12,
        recurrence: { kind: "rule", rule: { ...weekly, paused: true } },
      },
      "paused",
    ],
    [
      "is on its last occurrence",
      {
        status: "todo",
        due: oct12,
        recurrence: {
          kind: "rule",
          rule: { ...weekly, end: { kind: "count", total: 3, remaining: 1 } },
        },
      },
      "last",
    ],
    [
      "has no rule",
      { status: "todo", due: oct12, recurrence: { kind: "none" } },
      "not-recurring",
    ],
  ] as const)(
    "refuses a task that %s, writing nothing",
    async (_, task, reason) => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 2, ...task });
      const skip = createSkipOccurrence(deps(repository));

      const refused = skip(2);
      await expect(refused).rejects.toBeInstanceOf(NotSkippableError);
      await expect(refused).rejects.toMatchObject({ reason });
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("says, without writing, which tasks the menu offers skipping for", async () => {
    const repository = createInMemoryTaskRepository();
    const canSkip = createCanSkipOccurrence(deps(repository));
    const rule = { kind: "rule", rule: weekly } as const;
    const task = (changes: Partial<Task>): Task => ({
      ...(base as Task),
      ...changes,
    });
    repository.addTask({ id: 9 });
    const base = await repository.getTask(9);

    expect(canSkip(task({ status: "someday", recurrence: rule }))).toBe(true);
    expect(canSkip(task({ status: "done", recurrence: rule }))).toBe(false);
    expect(
      canSkip(task({ status: "todo", recurrence: { kind: "none" } })),
    ).toBe(false);
    expect(
      canSkip(
        task({
          status: "todo",
          recurrence: { kind: "rule", rule: { ...weekly, paused: true } },
        }),
      ),
    ).toBe(false);
    expect(
      canSkip(
        task({
          status: "todo",
          due: oct12,
          recurrence: {
            kind: "rule",
            rule: { ...weekly, end: { kind: "count", total: 3, remaining: 1 } },
          },
        }),
      ),
    ).toBe(false);
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a task whose rule cannot be read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({
      id: 4,
      status: "todo",
      recurrence: { kind: "unreadable", reason: "unknown version 2" },
    });
    const skip = createSkipOccurrence(deps(repository));

    await expect(skip(4)).rejects.toBeInstanceOf(RecurrenceUnreadableError);
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a task whose completion history cannot be read, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 5, status: "todo", recurrence: { kind: "rule", rule: weekly } },
      {
        completionHistory: {
          kind: "unreadable",
          reason: "unknown version 2",
        },
      },
    );
    const skip = createSkipOccurrence(deps(repository));

    await expect(skip(5)).rejects.toBeInstanceOf(
      CompletionHistoryUnreadableError,
    );
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(3);
    const skip = createSkipOccurrence(deps(repository));

    await expect(skip(3)).rejects.toMatchObject({ reason: "not-recurring" });
    expect(repository.writeCount()).toBe(0);
  });
});
