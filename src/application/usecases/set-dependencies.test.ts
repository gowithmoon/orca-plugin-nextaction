import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createSetDependencies } from "./set-dependencies";

function setup() {
  const repository = createInMemoryTaskRepository();
  const setDependencies = createSetDependencies({ repository });
  return { repository, setDependencies };
}

describe("set dependencies", () => {
  it("replaces the task's dependencies with the list given", async () => {
    const { repository, setDependencies } = setup();
    repository.addTask({ id: 1, dependencies: [2] });
    repository.addTask({ id: 2 });
    repository.addTask({ id: 3 });

    await setDependencies(1, [3, 2]);

    expect((await repository.getTask(1))?.dependencies).toEqual([3, 2]);
  });

  it("clears the task's stale dependencies in the same write", async () => {
    const { repository, setDependencies } = setup();
    // 7 was dropped (a block, no longer a task); 8 is gone altogether.
    repository.addTask({ id: 1, dependencies: [7, 2, 8] });
    repository.addTask({ id: 2 });
    repository.addTask({ id: 3 });
    repository.addBlock(7);

    // The panel adds 3 to the list as it shows it, stale ones included.
    await setDependencies(1, [7, 2, 8, 3]);

    expect((await repository.getTask(1))?.dependencies).toEqual([2, 3]);
    expect(repository.writeCount()).toBe(1);
  });
});
