import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createSetDependencyMode } from "./set-dependency-mode";

describe("set dependency mode", () => {
  it("switches the mode to any and back, one write each, leaving the rest as it is", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo", dependencies: [2, 3] });
    const setDependencyMode = createSetDependencyMode({ repository });

    await setDependencyMode(1, "any");
    expect(await repository.getTask(1)).toMatchObject({
      dependencyMode: "any",
      status: "todo",
      dependencies: [2, 3],
    });

    await setDependencyMode(1, "all");
    expect(await repository.getTask(1)).toMatchObject({
      dependencyMode: "all",
    });
    expect(repository.writeCount()).toBe(2);
  });

  it("fails on a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(2);
    const setDependencyMode = createSetDependencyMode({ repository });

    await expect(setDependencyMode(2, "any")).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });
});
