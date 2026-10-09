import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadNextActions } from "./read-next-actions";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const clock = createFixedClock(morning);
  const dayBoundary = createFixedDayBoundary();
  const readNextActions = createReadNextActions({
    repository,
    clock,
    dayBoundary,
  });
  return { repository, clock, readNextActions };
}

describe("read next actions", () => {
  it("lists the next actions, the highest score first", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 2 });
    repository.addTask({ id: 2, status: "inbox" });
    repository.addTask({
      id: 3,
      status: "doing",
      due: { year: 2026, month: 10, day: 9 },
    });
    repository.addTask({ id: 4, status: "todo" });

    const read = await readNextActions();

    expect(read.items.map((item) => item.task.id)).toEqual([3, 4, 1]);
  });

  it("keeps the task given as `keep` after it left the list, by its score, marked as kept", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo", importance: 7 });
    repository.addTask({ id: 2, status: "done", importance: 5 });
    repository.addTask({ id: 3, status: "todo", importance: 1 });

    const read = await readNextActions({ keep: 2 });

    expect(read.items.map((item) => [item.task.id, item.nextAction])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ]);
  });

  it("counts only the next actions in the total, not a kept task", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });
    repository.addTask({ id: 3, status: "doing" });

    expect((await readNextActions({ keep: 2 })).total).toBe(2);
    expect((await readNextActions()).total).toBe(2);
  });

  it("does not list the task given as `keep` once it is no longer a task", async () => {
    const { repository, readNextActions } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "waiting" });
    await repository.dropTask(2);

    const read = await readNextActions({ keep: 2 });

    expect(read.items.map((item) => item.task.id)).toEqual([1]);
  });
});
