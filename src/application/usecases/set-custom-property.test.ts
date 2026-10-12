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

  it("refuses a value of another kind than the property's, writing nothing", async () => {
    const { repository, setCustomProperty } = setup();

    await expect(
      setCustomProperty(1, "预算", { kind: "text", value: "1200" }),
    ).rejects.toBeInstanceOf(CustomPropertyChangedError);
    expect(repository.writeCount()).toBe(0);
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
