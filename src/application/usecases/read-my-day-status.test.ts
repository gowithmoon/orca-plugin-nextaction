import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import {
  createInMemoryTaskRepository,
  type InMemoryTaskRepository,
} from "../../../tests/in-memory-task-repository";
import { createReadMyDayStatus } from "./read-my-day-status";

// 2:00 on October 9 in UTC+8: before the 5:00 boundary, still October 8.
const deps = (repository: InMemoryTaskRepository) => ({
  repository,
  clock: createFixedClock("2026-10-09T02:00:00+08:00"),
  dayBoundary: createFixedDayBoundary(),
});

const oct7 = { day: { year: 2026, month: 10, day: 7 } };
const oct8 = { day: { year: 2026, month: 10, day: 8 } };
const oct9 = { day: { year: 2026, month: 10, day: 9 } };

describe("read My Day status", () => {
  it("is not in today for a task never added", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });

    expect(await createReadMyDayStatus(deps(repository))(1)).toEqual({
      kind: "not-in-today",
    });
  });

  it("is in today for a task with an entry on the current logical day", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 2 },
      { myDay: { kind: "readable", entries: [oct7, oct8] } },
    );

    expect(await createReadMyDayStatus(deps(repository))(2)).toEqual({
      kind: "in-today",
    });
  });

  it("is not in today for a task with only other days' entries", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 3 },
      { myDay: { kind: "readable", entries: [oct7, oct9] } },
    );

    expect(await createReadMyDayStatus(deps(repository))(3)).toEqual({
      kind: "not-in-today",
    });
  });

  it("says why when the task's My Day entries cannot be read", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 4 },
      { myDay: { kind: "unreadable", reason: "unknown version 2" } },
    );

    expect(await createReadMyDayStatus(deps(repository))(4)).toEqual({
      kind: "unreadable",
      reason: "unknown version 2",
    });
  });
});
