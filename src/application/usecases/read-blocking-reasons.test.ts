import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadBlockingReasons } from "./read-blocking-reasons";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readBlockingReasons = createReadBlockingReasons({
    repository,
    clock: createFixedClock("2026-10-09T10:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
  });
  return { repository, readBlockingReasons };
}

describe("read blocking reasons", () => {
  it("returns the reasons with the text of every task they name", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addTask({ id: 1, text: "Write the paper" });
    repository.addTask(
      { id: 2, text: "Write the introduction", status: "todo" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, text: "Collect the data", status: "waiting" },
      { parentId: 1 },
    );

    const read = await readBlockingReasons(1);

    expect(read.reasons).toEqual([
      { kind: "subtasks", source: 1, waitingFor: [2, 3] },
    ]);
    expect(read.tasks.get(1)).toEqual({ id: 1, text: "Write the paper" });
    expect(read.tasks.get(2)).toEqual({
      id: 2,
      text: "Write the introduction",
    });
    expect(read.tasks.get(3)).toEqual({ id: 3, text: "Collect the data" });
  });

  it("returns a dependency delay with its release day and the text of the task it counts from", async () => {
    const { repository, readBlockingReasons } = setup();
    // Today is the logical day 2026-10-09.
    repository.addTask({
      id: 1,
      text: "Hang the lamp",
      status: "todo",
      dependencies: [2],
      dependencyDelay: 3,
    });
    repository.addTask(
      { id: 2, text: "Paint the wall", status: "done" },
      {
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: new Date("2026-10-08T12:00:00+08:00"),
              day: { year: 2026, month: 10, day: 8 },
            },
          ],
        },
      },
    );

    const read = await readBlockingReasons(1);

    expect(read.reasons).toEqual([
      {
        kind: "dependencyDelay",
        source: 1,
        waitingFor: [],
        countedFrom: 2,
        releasedOn: { year: 2026, month: 10, day: 11 },
      },
    ]);
    expect(read.tasks.get(1)).toEqual({ id: 1, text: "Hang the lamp" });
    expect(read.tasks.get(2)).toEqual({ id: 2, text: "Paint the wall" });
  });

  it("returns no reasons for a task nothing blocks", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });

    const read = await readBlockingReasons(1);

    expect(read.reasons).toEqual([]);
    expect(read.tasks.size).toBe(0);
  });

  it("returns the task's own dependencies in order, marking the stale ones", async () => {
    const { repository, readBlockingReasons } = setup();
    // 7 was dropped: a block, but no longer a task. 8 is gone altogether.
    repository.addTask({ id: 1, dependencies: [2, 7, 3, 8] });
    repository.addTask({ id: 2, text: "Collect the data" });
    repository.addTask({ id: 3, text: "Ask Wang", status: "done" });
    repository.addBlock(7, { text: "Dropped" });

    const read = await readBlockingReasons(1);

    expect(read.dependencies).toEqual([
      { id: 2, text: "Collect the data", stale: false },
      { id: 7, text: null, stale: true },
      { id: 3, text: "Ask Wang", stale: false },
      { id: 8, text: null, stale: true },
    ]);
  });

  it("writes nothing when reading, stale dependencies included (ADR 0016)", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addTask({ id: 1, dependencies: [7, 2] });
    repository.addTask({ id: 2 });

    await readBlockingReasons(1);

    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(1))?.dependencies).toEqual([7, 2]);
  });

  it("returns no reasons for a block that is not a task", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addBlock(1);

    expect((await readBlockingReasons(1)).reasons).toEqual([]);
  });
});
