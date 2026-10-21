import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CustomPropertyChangedError } from "../../domain/task/custom-property";
import { createAddNewBlockRefTarget } from "./add-new-block-ref-target";
import { createReadBlockRefCandidates } from "./read-block-ref-candidates";

function setup() {
  const repository = createInMemoryTaskRepository();
  repository.setCustomPropertyDefinitions([
    { name: "委托给", kind: "blockRefs", scope: "人" },
    { name: "来源", kind: "blockRefs", scope: null },
    { name: "下发人", kind: "text" },
  ]);
  repository.addBlock(26, { text: "张三", tags: ["人"], page: true });
  repository.addTask({
    id: 1,
    status: "todo",
    customProperties: { 委托给: { kind: "blockRefs", value: [26] } },
  });
  return {
    repository,
    addNewBlockRefTarget: createAddNewBlockRefTarget({ repository }),
    readBlockRefCandidates: createReadBlockRefCandidates({ repository }),
  };
}

describe("add a new block reference target", () => {
  it("adds a new page after the targets held, in one write", async () => {
    const { repository, addNewBlockRefTarget } = setup();

    await addNewBlockRefTarget(1, "委托给", "  李四 ");

    const value = (await repository.getTask(1))?.customProperties.委托给;
    expect(value?.kind).toBe("blockRefs");
    const targets = value?.kind === "blockRefs" ? value.value : [];
    expect(targets).toHaveLength(2);
    expect(targets[0]).toBe(26);
    expect(await repository.readBlockTexts([targets[1] as number])).toEqual(
      new Map([[targets[1], "李四"]]),
    );
    expect(repository.writeCount()).toBe(1);
  });

  it("puts the new page under the property's scope, so it is offered next time", async () => {
    const { addNewBlockRefTarget, readBlockRefCandidates } = setup();

    await addNewBlockRefTarget(1, "委托给", "李四");

    expect(await readBlockRefCandidates("委托给", "李四")).toMatchObject([
      { text: "李四" },
    ]);
  });

  it("adds a page already named so instead of creating another", async () => {
    const { repository, addNewBlockRefTarget } = setup();
    repository.addBlock(30, { text: "王五", page: true });

    await addNewBlockRefTarget(1, "委托给", "王五");

    expect((await repository.getTask(1))?.customProperties.委托给).toEqual({
      kind: "blockRefs",
      value: [26, 30],
    });
  });

  it("does nothing for a blank name", async () => {
    const { repository, addNewBlockRefTarget } = setup();

    await addNewBlockRefTarget(1, "委托给", "  ");

    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a property no longer defined, or no longer a block reference, writing nothing", async () => {
    const { repository, addNewBlockRefTarget } = setup();

    await expect(addNewBlockRefTarget(1, "删掉的", "李四")).rejects.toThrow(
      CustomPropertyChangedError,
    );
    await expect(addNewBlockRefTarget(1, "下发人", "李四")).rejects.toThrow(
      CustomPropertyChangedError,
    );
    expect(repository.writeCount()).toBe(0);
  });
});
