import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";
import { createSetSequential } from "./set-sequential";

describe("set sequential", () => {
  it("switches sequential on and off, one write each, leaving the rest as it is", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, status: "todo", importance: 6 });
    const setSequential = createSetSequential({ repository });

    await setSequential(1, true);
    expect(await repository.getTask(1)).toMatchObject({
      sequential: true,
      status: "todo",
      importance: 6,
    });

    await setSequential(1, false);
    expect(await repository.getTask(1)).toMatchObject({ sequential: false });
    expect(repository.writeCount()).toBe(2);
  });

  it("fails on a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(2);
    const setSequential = createSetSequential({ repository });

    await expect(setSequential(2, true)).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses to switch sequential on when it would make a cycle, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask(
      { id: 2, text: "Pack", dependencies: [3] },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, text: "Clean" }, { parentId: 1 });
    const setSequential = createSetSequential({ repository });

    const refused = setSequential(1, true);

    await expect(refused).rejects.toBeInstanceOf(DependencyCycleError);
    await expect(refused).rejects.toMatchObject({
      cycle: {
        kind: "sequential",
        waiting: { id: 3, text: "Clean" },
        waitingFor: { id: 2, text: "Pack" },
      },
    });
    expect((await repository.getTask(1))?.sequential).toBe(false);
    expect(repository.writeCount()).toBe(0);
  });

  it("switching sequential off is never refused", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, sequential: true });
    repository.addTask({ id: 2, dependencies: [3] }, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 1 });
    const setSequential = createSetSequential({ repository });

    await setSequential(1, false);

    expect((await repository.getTask(1))?.sequential).toBe(false);
  });
});
