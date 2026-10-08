import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createDropTask } from "./drop-task";

describe("drop task", () => {
  it("makes the block a plain block and discards its plugin block properties", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 30, status: "doing" },
      {
        pluginProperties: {
          completions: { kind: "present", data: { entries: [{ at: "x" }] } },
          damaged: { kind: "unreadable", reason: "unknown version 9" },
        },
      },
    );
    const dropTask = createDropTask({ repository });

    await dropTask(30);

    expect(await repository.getTask(30)).toBeNull();
    expect(repository.writeCount()).toBe(1);
    // Converted again, it starts blank: nothing came back from before.
    await repository.convertToTask(30);
    expect((await repository.getTask(30))?.status).toBe("inbox");
    expect(await repository.readPluginBlockProperty(30, "completions")).toEqual(
      { kind: "absent" },
    );
    expect(await repository.readPluginBlockProperty(30, "damaged")).toEqual({
      kind: "absent",
    });
  });

  it("leaves its subtasks as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 31, status: "todo" });
    repository.addTask({ id: 32, status: "doing" }, { parentId: 31 });
    const dropTask = createDropTask({ repository });

    await dropTask(31);

    expect((await repository.getTask(32))?.status).toBe("doing");
  });

  it("throws when the write fails, leaving the task as it was", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask(
      { id: 33, status: "todo" },
      {
        pluginProperties: {
          completions: { kind: "present", data: { entries: [] } },
        },
      },
    );
    const failure = new Error("Orca is gone");
    repository.failWrites(failure);
    const dropTask = createDropTask({ repository });

    await expect(dropTask(33)).rejects.toBe(failure);
    expect((await repository.getTask(33))?.status).toBe("todo");
    expect(await repository.readPluginBlockProperty(33, "completions")).toEqual(
      { kind: "present", data: { entries: [] } },
    );
  });

  it("fails on a block that is not a task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(34);
    const dropTask = createDropTask({ repository });

    await expect(dropTask(34)).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });
});
