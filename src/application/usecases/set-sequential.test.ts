import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
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
});
