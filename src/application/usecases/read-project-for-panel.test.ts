import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadProjectForPanel } from "./read-project-for-panel";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectForPanel = createReadProjectForPanel({ repository });
  return { repository, readProjectForPanel };
}

describe("read a project for the project panel", () => {
  it("reads the project with every built-in property", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addProject({
      id: 10,
      text: "Move house",
      status: "active",
      goal: "Keys handed over",
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 12, day: 31 },
      importance: 6,
      urgency: 2,
    });

    expect(await readProjectForPanel(10)).toMatchObject({
      project: {
        id: 10,
        text: "Move house",
        status: "active",
        goal: "Keys handed over",
        start: { year: 2026, month: 10, day: 1 },
        due: { year: 2026, month: 12, day: 31 },
        importance: 6,
        urgency: 2,
      },
    });
  });

  it("a block that is not a project reads as none", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addBlock(7);
    repository.addTask({ id: 1 });

    expect(await readProjectForPanel(7)).toBeNull();
    expect(await readProjectForPanel(1)).toBeNull();
    expect(await readProjectForPanel(99)).toBeNull();
  });

  it("while the project tag is paused, it reads as none", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.pauseProjectTag(true);

    expect(await readProjectForPanel(10)).toBeNull();
  });

  it("reads every custom property of the project tag in Orca's order, a value of the wrong kind as empty", async () => {
    const { repository, readProjectForPanel } = setup();
    repository.setProjectCustomPropertyDefinitions([
      { name: "工作量", kind: "number" },
      { name: "客户", kind: "text" },
      { name: "负责人", kind: "blockRefs", scope: "人" },
    ]);
    repository.addBlock(26, { text: "张三" });
    repository.addProject(
      { id: 10, text: "Move house" },
      {
        customProperties: {
          工作量: { kind: "text", value: "很多" },
          负责人: { kind: "blockRefs", value: [26, 99] },
        },
      },
    );

    const read = await readProjectForPanel(10);

    expect(read?.customProperties).toEqual([
      {
        definition: { name: "工作量", kind: "number" },
        value: { kind: "number", value: null },
      },
      {
        definition: { name: "客户", kind: "text" },
        value: { kind: "text", value: null },
      },
      {
        definition: { name: "负责人", kind: "blockRefs", scope: "人" },
        value: { kind: "blockRefs", value: [26, 99] },
        targets: [
          { id: 26, text: "张三", deleted: false },
          { id: 99, text: null, deleted: true },
        ],
      },
    ]);
  });
});
