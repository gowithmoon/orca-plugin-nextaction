import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CustomPropertyChangedError } from "../../domain/task/custom-property";
import { createReadProjectForPanel } from "./read-project-for-panel";
import { createSetProjectCustomProperty } from "./set-project-custom-property";

function setup() {
  const repository = createInMemoryTaskRepository();
  repository.setProjectCustomPropertyDefinitions([
    { name: "客户", kind: "text" },
    { name: "阶段", kind: "single", choices: ["立项"] },
  ]);
  repository.addProject({ id: 10, text: "Move house", importance: 6 });
  const clock = createFixedClock("2026-10-12T20:00:00+08:00");
  return {
    repository,
    setProjectCustomProperty: createSetProjectCustomProperty({
      repository,
      clock,
    }),
    readProjectForPanel: createReadProjectForPanel({ repository }),
  };
}

describe("set a project's custom property", () => {
  it("writes the value, one write, and reads it back", async () => {
    const { repository, setProjectCustomProperty, readProjectForPanel } =
      setup();

    await setProjectCustomProperty(10, "客户", { kind: "text", value: "甲方" });

    const read = await readProjectForPanel(10);
    expect(read?.project.importance).toBe(6);
    expect(read?.customProperties[0]).toEqual({
      definition: { name: "客户", kind: "text" },
      value: { kind: "text", value: "甲方" },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("adds an option typed in to the project tag's choices", async () => {
    const { setProjectCustomProperty, readProjectForPanel } = setup();

    await setProjectCustomProperty(10, "阶段", {
      kind: "single",
      value: "验收",
    });

    expect((await readProjectForPanel(10))?.customProperties[1]).toEqual({
      definition: { name: "阶段", kind: "single", choices: ["立项", "验收"] },
      value: { kind: "single", value: "验收" },
    });
  });

  it("refuses, writing nothing, when the property was deleted or its kind changed in Orca", async () => {
    const { repository, setProjectCustomProperty } = setup();

    await expect(
      setProjectCustomProperty(10, "预算", { kind: "number", value: 1 }),
    ).rejects.toBeInstanceOf(CustomPropertyChangedError);
    await expect(
      setProjectCustomProperty(10, "客户", { kind: "number", value: 1 }),
    ).rejects.toBeInstanceOf(CustomPropertyChangedError);
    expect(repository.writeCount()).toBe(0);
  });

  it("on a block that is both, the task's and the project's values stay apart", async () => {
    const { repository, setProjectCustomProperty, readProjectForPanel } =
      setup();
    repository.setCustomPropertyDefinitions([{ name: "客户", kind: "text" }]);
    repository.addTask({
      id: 20,
      customProperties: { 客户: { kind: "text", value: "任务的客户" } },
    });
    repository.addProject({ id: 20, text: "Both" });

    await setProjectCustomProperty(20, "客户", {
      kind: "text",
      value: "项目的客户",
    });

    expect((await repository.getTask(20))?.customProperties.客户).toEqual({
      kind: "text",
      value: "任务的客户",
    });
    expect((await readProjectForPanel(20))?.customProperties[0]?.value).toEqual(
      { kind: "text", value: "项目的客户" },
    );
  });
});
