import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CustomPropertyChangedError } from "../../domain/task/custom-property";
import { createSetCustomProperty } from "./set-custom-property";

function setup() {
  const repository = createInMemoryTaskRepository();
  repository.setCustomPropertyDefinitions([
    { name: "下发人", kind: "text" },
    { name: "预算", kind: "number" },
    { name: "来源", kind: "single", choices: ["客户", "内部"] },
    { name: "涉及", kind: "multi", choices: ["x", "y"] },
  ]);
  repository.addTask({ id: 1, status: "todo", importance: 6 });
  const clock = createFixedClock("2026-10-12T20:00:00+08:00");
  return {
    repository,
    setCustomProperty: createSetCustomProperty({ repository, clock }),
  };
}

describe("set custom property", () => {
  it("writes the value, one write, leaving the rest as it is", async () => {
    const { repository, setCustomProperty } = setup();

    await setCustomProperty(1, "下发人", { kind: "text", value: "张三" });

    expect(await repository.getTask(1)).toMatchObject({
      status: "todo",
      importance: 6,
      customProperties: { 下发人: { kind: "text", value: "张三" } },
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("clears the value", async () => {
    const { repository, setCustomProperty } = setup();
    await setCustomProperty(1, "预算", { kind: "number", value: 1200 });

    await setCustomProperty(1, "预算", { kind: "number", value: null });

    expect((await repository.getTask(1))?.customProperties.预算).toEqual({
      kind: "number",
      value: null,
    });
  });

  it("picks an existing option, adding none", async () => {
    const { repository, setCustomProperty } = setup();

    await setCustomProperty(1, "来源", { kind: "single", value: "客户" });

    expect((await repository.getTask(1))?.customProperties.来源).toEqual({
      kind: "single",
      value: "客户",
    });
    expect(await repository.readCustomPropertyDefinitions()).toContainEqual({
      name: "来源",
      kind: "single",
      choices: ["客户", "内部"],
    });
  });

  it("adds an option typed in, in the same write", async () => {
    const { repository, setCustomProperty } = setup();

    await setCustomProperty(1, "涉及", { kind: "multi", value: ["x", "新项"] });

    expect((await repository.getTask(1))?.customProperties.涉及).toEqual({
      kind: "multi",
      value: ["x", "新项"],
    });
    expect(await repository.readCustomPropertyDefinitions()).toContainEqual({
      name: "涉及",
      kind: "multi",
      choices: ["x", "y", "新项"],
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("clears a single and a multiple choice", async () => {
    const { repository, setCustomProperty } = setup();
    await setCustomProperty(1, "来源", { kind: "single", value: "客户" });
    await setCustomProperty(1, "涉及", { kind: "multi", value: ["x"] });

    await setCustomProperty(1, "来源", { kind: "single", value: null });
    await setCustomProperty(1, "涉及", { kind: "multi", value: [] });

    expect((await repository.getTask(1))?.customProperties).toMatchObject({
      来源: { kind: "single", value: null },
      涉及: { kind: "multi", value: [] },
    });
  });

  it("refuses a value of another kind than the property's, writing nothing", async () => {
    const { repository, setCustomProperty } = setup();

    await expect(
      setCustomProperty(1, "预算", { kind: "text", value: "1200" }),
    ).rejects.toBeInstanceOf(CustomPropertyChangedError);
    expect(repository.writeCount()).toBe(0);
  });

  it("adds and removes block reference targets, one write each", async () => {
    const { repository, setCustomProperty } = setup();
    repository.setCustomPropertyDefinitions([
      { name: "委托给", kind: "blockRefs", scope: "人" },
    ]);

    await setCustomProperty(1, "委托给", { kind: "blockRefs", value: [26] });
    await setCustomProperty(1, "委托给", {
      kind: "blockRefs",
      value: [26, 27],
    });
    await setCustomProperty(1, "委托给", { kind: "blockRefs", value: [27] });

    expect((await repository.getTask(1))?.customProperties.委托给).toEqual({
      kind: "blockRefs",
      value: [27],
    });
    expect(repository.writeCount()).toBe(3);
  });

  it("refuses a property no longer defined (deleted in Orca), writing nothing", async () => {
    const { repository, setCustomProperty } = setup();
    repository.setCustomPropertyDefinitions([{ name: "预算", kind: "number" }]);

    await expect(
      setCustomProperty(1, "下发人", { kind: "text", value: "张三" }),
    ).rejects.toMatchObject({ property: "下发人", reason: "not-defined" });
    expect(repository.writeCount()).toBe(0);
  });
});
