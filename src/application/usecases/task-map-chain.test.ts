import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import { createReadTaskMap } from "./read-task-map";
import { type TaskMapChain, taskMapChain } from "./task-map-chain";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readTaskMap = createReadTaskMap({
    repository,
    clock: createFixedClock("2026-10-09T10:00:00+08:00"),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readTaskMap };
}

/** The chain's tasks, sorted, and its edges as `[from, to]`, sorted. */
function shape(chain: TaskMapChain) {
  return {
    tasks: [...chain.tasks].sort((a, b) => a - b),
    edges: [...chain.edges]
      .map((edge): [TaskId, TaskId] => [edge.from, edge.to])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  };
}

describe("task map chain", () => {
  it("follows the tasks waiting for it along dependencies to the end", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });
    repository.addTask({ id: 3, status: "todo", dependencies: [2] });
    repository.addTask({ id: 4, status: "todo", dependencies: [9] });
    repository.addTask({ id: 9, status: "todo" });

    const read = await readTaskMap();

    expect(shape(taskMapChain(read, 1))).toEqual({
      tasks: [1, 2, 3],
      edges: [
        [1, 2],
        [2, 3],
      ],
    });
  });

  it("follows what it waits for the other way to the end, never turning back down another branch", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });
    repository.addTask({ id: 3, status: "todo", dependencies: [2] });
    repository.addTask({ id: 4, status: "todo", dependencies: [1] });

    const read = await readTaskMap();

    // 4 also waits for 1, but is neither upstream nor downstream of 3.
    expect(shape(taskMapChain(read, 3))).toEqual({
      tasks: [1, 2, 3],
      edges: [
        [1, 2],
        [2, 3],
      ],
    });
  });

  it("follows the subtasks after it of a sequential parent task, and those before it the other way", async () => {
    const { repository, readTaskMap } = setup();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask(
      { id: 1, status: "todo", sequential: true },
      { parentId: 10 },
    );
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo", dependencies: [4] });

    const read = await readTaskMap();
    const chain = shape(taskMapChain(read, 3));

    // 1, their parent task, waits for every subtask: reached downstream.
    expect(chain.tasks).toEqual([1, 2, 3, 4, 5]);
    expect(chain.edges).toEqual([
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
  });

  it("follows a parent task back to every subtask below it, those subtasks waiting for nothing upstream", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "todo" });
    repository.addTask({ id: 6, status: "todo", dependencies: [5] });

    const read = await readTaskMap();

    // 6 waits for 5, which has nothing to do with 1's tree.
    expect(shape(taskMapChain(read, 1))).toEqual({
      tasks: [1, 2, 3, 4],
      edges: [],
    });
  });

  it("ends when a dependency cycle comes back round, every task and edge on it reached", async () => {
    const { repository, readTaskMap } = setup();
    repository.addTask({ id: 1, status: "todo", dependencies: [3] });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });
    repository.addTask({ id: 3, status: "todo", dependencies: [2] });
    repository.addTask({ id: 4, status: "todo", dependencies: [3] });

    const read = await readTaskMap();

    expect(shape(taskMapChain(read, 1))).toEqual({
      tasks: [1, 2, 3, 4],
      edges: [
        [1, 2],
        [2, 3],
        [3, 1],
        [3, 4],
      ],
    });
  });
});
