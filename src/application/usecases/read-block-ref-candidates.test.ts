import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CustomPropertyChangedError } from "../../domain/task/custom-property";
import { createReadBlockRefCandidates } from "./read-block-ref-candidates";

function setup() {
  const repository = createInMemoryTaskRepository();
  repository.setCustomPropertyDefinitions([
    { name: "委托给", kind: "blockRefs", scope: "人" },
    { name: "来源", kind: "blockRefs", scope: null },
    { name: "下发人", kind: "text" },
  ]);
  repository.addBlock(26, { text: "张三", tags: ["人"] });
  repository.addBlock(27, { text: "张三丰的书" });
  repository.addBlock(28, { text: "李四", tags: ["人"] });
  return {
    repository,
    readBlockRefCandidates: createReadBlockRefCandidates({ repository }),
  };
}

describe("read block reference candidates", () => {
  it("searches only blocks carrying the property's scope tag", async () => {
    const { readBlockRefCandidates } = setup();

    expect(await readBlockRefCandidates("委托给", "张三")).toEqual([
      { id: 26, text: "张三" },
    ]);
  });

  it("searches every block when the property has no scope", async () => {
    const { readBlockRefCandidates } = setup();

    expect(await readBlockRefCandidates("来源", "张三")).toEqual([
      { id: 26, text: "张三" },
      { id: 27, text: "张三丰的书" },
    ]);
  });

  it("refuses a property no longer defined, or no longer a block reference", async () => {
    const { readBlockRefCandidates } = setup();

    await expect(readBlockRefCandidates("删掉的", "张")).rejects.toThrow(
      CustomPropertyChangedError,
    );
    await expect(readBlockRefCandidates("下发人", "张")).rejects.toThrow(
      CustomPropertyChangedError,
    );
  });
});
