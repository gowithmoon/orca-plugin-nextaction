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

  it("returns no reasons for a task nothing blocks", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });

    const read = await readBlockingReasons(1);

    expect(read.reasons).toEqual([]);
    expect(read.tasks.size).toBe(0);
  });

  it("returns no reasons for a block that is not a task", async () => {
    const { repository, readBlockingReasons } = setup();
    repository.addBlock(1);

    expect((await readBlockingReasons(1)).reasons).toEqual([]);
  });
});
