import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadTask, createReadTaskForPanel } from "./read-task";

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

describe("read task for the task panel", () => {
  it("reads the task with every custom property in Orca's order, each with this task's value or empty", async () => {
    const repository = createInMemoryTaskRepository();
    repository.setCustomPropertyDefinitions([
      { name: "下发人", kind: "text" },
      { name: "已报销", kind: "boolean" },
      { name: "来源", kind: "single", choices: ["客户"] },
    ]);
    repository.addTask({
      id: 40,
      status: "todo",
      customProperties: { 下发人: { kind: "text", value: "张三" } },
    });
    const readTaskForPanel = createReadTaskForPanel({ repository });

    const read = await readTaskForPanel(40);

    expect(read?.task.status).toBe("todo");
    expect(read?.customProperties).toEqual([
      {
        definition: { name: "下发人", kind: "text" },
        value: { kind: "text", value: "张三" },
      },
      {
        definition: { name: "已报销", kind: "boolean" },
        value: { kind: "boolean", value: false },
      },
      {
        definition: { name: "来源", kind: "single", choices: ["客户"] },
        value: { kind: "single", value: null },
      },
    ]);
  });

  it("reads a block that is not a task as null", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(41);
    const readTaskForPanel = createReadTaskForPanel({ repository });

    expect(await readTaskForPanel(41)).toBeNull();
  });

  it("reads the text of each block reference target, a target deleted or never there marked deleted", async () => {
    const repository = createInMemoryTaskRepository();
    repository.setCustomPropertyDefinitions([
      { name: "委托给", kind: "blockRefs", scope: "人" },
    ]);
    repository.addBlock(26, { text: "张三" });
    repository.addBlock(27, { text: "李四" });
    repository.addTask({
      id: 40,
      customProperties: {
        委托给: { kind: "blockRefs", value: [27, 99, 26] },
      },
    });
    const readTaskForPanel = createReadTaskForPanel({ repository });

    const read = await readTaskForPanel(40);

    expect(read?.customProperties).toEqual([
      {
        definition: { name: "委托给", kind: "blockRefs", scope: "人" },
        value: { kind: "blockRefs", value: [27, 99, 26] },
        targets: [
          { id: 27, text: "李四", deleted: false },
          { id: 99, text: null, deleted: true },
          { id: 26, text: "张三", deleted: false },
        ],
      },
    ]);
  });
});
