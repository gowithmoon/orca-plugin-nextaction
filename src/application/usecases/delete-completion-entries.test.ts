import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CompletionHistoryUnreadableError } from "./completion-history-unreadable-error";
import {
  createClearCompletionHistory,
  createDeleteCompletionEntry,
} from "./delete-completion-entries";

const unreadable = { kind: "unreadable", reason: "unknown version 2" } as const;

const oct12 = { year: 2026, month: 10, day: 12 };
const oct13 = { year: 2026, month: 10, day: 13 };
const oct14 = { year: 2026, month: 10, day: 14 };

const completedOct12 = { at: new Date("2026-10-12T01:00:00.000Z"), day: oct12 };
const skippedOct13 = {
  at: new Date("2026-10-13T01:00:00.000Z"),
  day: oct13,
  kind: "skip",
} as const;
const completedOct14 = { at: new Date("2026-10-14T01:00:00.000Z"), day: oct14 };

const history = {
  kind: "readable",
  history: [completedOct12, skippedOct13, completedOct14],
} as const;

describe("delete one entry of a task's completion history", () => {
  it("removes only that entry, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1, status: "todo" },
      { completionHistory: history },
    );

    await createDeleteCompletionEntry({ repository })(1, {
      at: new Date("2026-10-13T01:00:00.000Z"),
      kind: "skip",
    });

    expect(await repository.readCompletionHistory(1)).toEqual({
      kind: "readable",
      history: [completedOct12, completedOct14],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it.each([
    ["no entry at that time", "2026-10-15T01:00:00.000Z", "completion"],
    ["an entry of the other kind", "2026-10-13T01:00:00.000Z", "completion"],
  ] as const)("writes nothing when there is %s", async (_, at, kind) => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1, status: "todo" },
      { completionHistory: history },
    );

    await createDeleteCompletionEntry({ repository })(1, {
      at: new Date(at),
      kind,
    });

    expect(await repository.readCompletionHistory(1)).toEqual(history);
    expect(repository.writeCount()).toBe(0);
  });

  it("leaves the task's status and recurrence rule, remaining occurrences included, as they are", async () => {
    const repository = createInMemoryTaskRepository();
    const recurrence = {
      kind: "rule",
      rule: {
        period: { interval: 1, unit: "week" },
        basis: "schedule",
        end: { kind: "count", total: 5, remaining: 3 },
      },
    } as const;
    repository.addTask(
      { id: 1, status: "doing", due: oct14, recurrence },
      { completionHistory: history },
    );

    await createDeleteCompletionEntry({ repository })(1, {
      at: new Date("2026-10-14T01:00:00.000Z"),
      kind: "completion",
    });

    expect(await repository.getTask(1)).toMatchObject({
      status: "doing",
      due: oct14,
      recurrence,
    });
  });

  it("refuses, writing nothing, when the completion history cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1, status: "todo" },
      { completionHistory: unreadable },
    );

    await expect(
      createDeleteCompletionEntry({ repository })(1, {
        at: new Date("2026-10-13T01:00:00.000Z"),
        kind: "skip",
      }),
    ).rejects.toThrow(CompletionHistoryUnreadableError);

    expect(await repository.readCompletionHistory(1)).toEqual(unreadable);
    expect(repository.writeCount()).toBe(0);
  });
});

describe("clear a task's completion history", () => {
  it("leaves it empty, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1, status: "todo" },
      { completionHistory: history },
    );

    await createClearCompletionHistory({ repository })(1);

    expect(await repository.readCompletionHistory(1)).toEqual({
      kind: "readable",
      history: [],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("refuses, writing nothing, when the completion history cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 1, status: "todo" },
      { completionHistory: unreadable },
    );

    await expect(
      createClearCompletionHistory({ repository })(1),
    ).rejects.toThrow(CompletionHistoryUnreadableError);

    expect(await repository.readCompletionHistory(1)).toEqual(unreadable);
    expect(repository.writeCount()).toBe(0);
  });
});
