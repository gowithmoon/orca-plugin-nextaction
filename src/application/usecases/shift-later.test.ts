import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import { createShiftLater } from "./shift-later";

function setup() {
  const repository = createInMemoryTaskRepository();
  const shiftLater = createShiftLater({
    repository,
    clock: createFixedClock("2026-10-09T10:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, shiftLater };
}

function day(year: number, month: number, date: number) {
  return { year, month, day: date };
}

/** A task's start and due dates as the notes now hold them. */
async function datesOf(
  repository: ReturnType<typeof createInMemoryTaskRepository>,
  id: TaskId,
) {
  const task = await repository.getTask(id);
  return [task?.start ?? null, task?.due ?? null];
}

describe("shift later", () => {
  it("moves a task in conflict to its dependency's due date, its due date by as many days, in one undo", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        start: day(2026, 10, 1),
        due: day(2026, 10, 12),
      },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 8),
        due: day(2026, 10, 10),
        dependencies: [2],
      },
      { parentId: 1 },
    );

    const shifted = await shiftLater(2);

    expect(shifted).toBe(1);
    expect(await datesOf(repository, 3)).toEqual([
      day(2026, 10, 12),
      day(2026, 10, 14),
    ]);
    expect(await datesOf(repository, 2)).toEqual([
      day(2026, 10, 1),
      day(2026, 10, 12),
    ]);
    expect(repository.writeCount()).toBe(1);
  });

  it("follows the dependencies on: a task waiting for a shifted one is judged by its new due date", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 8),
        due: day(2026, 10, 10),
        dependencies: [2],
      },
      { parentId: 1 },
    );
    // No conflict before 3 moves: 3 is due 10-10.
    repository.addTask(
      {
        id: 4,
        status: "todo",
        start: day(2026, 10, 11),
        due: day(2026, 10, 11),
        dependencies: [3],
      },
      { parentId: 1 },
    );

    const shifted = await shiftLater(2);

    expect(shifted).toBe(2);
    expect(await datesOf(repository, 3)).toEqual([
      day(2026, 10, 12),
      day(2026, 10, 14),
    ]);
    expect(await datesOf(repository, 4)).toEqual([
      day(2026, 10, 14),
      day(2026, 10, 14),
    ]);
    expect(repository.writeCount()).toBe(1);
  });

  it("takes the latest date for a task reached along several paths", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 10),
        due: day(2026, 10, 20),
        dependencies: [2],
      },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 4,
        status: "todo",
        start: day(2026, 10, 10),
        due: day(2026, 10, 11),
        dependencies: [2],
      },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 5,
        status: "todo",
        start: day(2026, 10, 14),
        due: day(2026, 10, 15),
        dependencies: [3, 4],
      },
      { parentId: 1 },
    );

    const shifted = await shiftLater(2);

    expect(shifted).toBe(3);
    expect(await datesOf(repository, 4)).toEqual([
      day(2026, 10, 12),
      day(2026, 10, 13),
    ]);
    expect(await datesOf(repository, 5)).toEqual([
      day(2026, 10, 22),
      day(2026, 10, 23),
    ]);
  });

  it("moves only the start of a task with no due date", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", start: day(2026, 10, 8), dependencies: [2] },
      { parentId: 1 },
    );

    expect(await shiftLater(2)).toBe(1);
    expect(await datesOf(repository, 3)).toEqual([day(2026, 10, 12), null]);
  });

  it("counts the dependency delay", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 13),
        due: day(2026, 10, 16),
        dependencies: [2],
        dependencyDelay: 2,
      },
      { parentId: 1 },
    );

    expect(await shiftLater(2)).toBe(1);
    expect(await datesOf(repository, 3)).toEqual([
      day(2026, 10, 14),
      day(2026, 10, 17),
    ]);
  });

  it("moves neither tasks outside the project nor done ones", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "done",
        start: day(2026, 10, 8),
        due: day(2026, 10, 9),
        dependencies: [2],
      },
      { parentId: 1 },
    );
    // Another project's, and no project's.
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 6, status: "todo", start: day(2026, 10, 8), dependencies: [2] },
      { parentId: 5 },
    );
    repository.addTask({
      id: 7,
      status: "todo",
      start: day(2026, 10, 8),
      dependencies: [2],
    });
    repository.addTask(
      { id: 4, status: "todo", start: day(2026, 10, 8), dependencies: [2] },
      { parentId: 1 },
    );

    expect(await shiftLater(2)).toBe(1);
    expect(await datesOf(repository, 3)).toEqual([
      day(2026, 10, 8),
      day(2026, 10, 9),
    ]);
    expect(await datesOf(repository, 6)).toEqual([day(2026, 10, 8), null]);
    expect(await datesOf(repository, 7)).toEqual([day(2026, 10, 8), null]);
    expect(await datesOf(repository, 4)).toEqual([day(2026, 10, 12), null]);
  });

  it("writes nothing and resolves to 0 when no task conflicts", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", due: day(2026, 10, 12) },
      { parentId: 1 },
    );
    // Starts on the due day itself.
    repository.addTask(
      { id: 3, status: "todo", start: day(2026, 10, 12), dependencies: [2] },
      { parentId: 1 },
    );
    // No start of its own: never in conflict.
    repository.addTask(
      { id: 4, status: "todo", due: day(2026, 10, 10), dependencies: [2] },
      { parentId: 1 },
    );

    expect(await shiftLater(2)).toBe(0);
    expect(repository.writeCount()).toBe(0);
  });

  it("ends on a dependency cycle in the notes, each task shifted once and the task shifted from never", async () => {
    const { repository, shiftLater } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        start: day(2026, 10, 1),
        due: day(2026, 10, 12),
        dependencies: [4],
      },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 10, 8),
        due: day(2026, 10, 10),
        dependencies: [2, 4],
      },
      { parentId: 1 },
    );
    repository.addTask(
      {
        id: 4,
        status: "todo",
        start: day(2026, 10, 9),
        due: day(2026, 10, 9),
        dependencies: [3],
      },
      { parentId: 1 },
    );

    expect(await shiftLater(2)).toBe(2);
    expect(await datesOf(repository, 3)).toEqual([
      day(2026, 10, 12),
      day(2026, 10, 14),
    ]);
    expect(await datesOf(repository, 4)).toEqual([
      day(2026, 10, 14),
      day(2026, 10, 14),
    ]);
    expect(await datesOf(repository, 2)).toEqual([
      day(2026, 10, 1),
      day(2026, 10, 12),
    ]);
  });
});
