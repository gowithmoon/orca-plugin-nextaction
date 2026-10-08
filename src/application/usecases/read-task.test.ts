import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadTask } from "./read-task";

describe("read task", () => {
  it("reads the task's current status", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 40, status: "someday" });
    const readTask = createReadTask({ repository });

    expect((await readTask(40))?.status).toBe("someday");
  });

  it("reads a block that is not a task as null", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(41);
    const readTask = createReadTask({ repository });

    expect(await readTask(41)).toBeNull();
  });
});
