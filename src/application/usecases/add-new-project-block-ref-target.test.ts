import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { CustomPropertyChangedError } from "../../domain/task/custom-property";
import { createAddNewProjectBlockRefTarget } from "./add-new-project-block-ref-target";
import { createReadProjectForPanel } from "./read-project-for-panel";

function setup() {
  const repository = createInMemoryTaskRepository();
  repository.setProjectCustomPropertyDefinitions([
    { name: "负责人", kind: "blockRefs", scope: "人" },
    { name: "客户", kind: "text" },
  ]);
  repository.addProject({ id: 10, text: "Move house" });
  return {
    repository,
    addNew: createAddNewProjectBlockRefTarget({ repository }),
    readProjectForPanel: createReadProjectForPanel({ repository }),
  };
}

describe("add a new block reference target to a project", () => {
  it("adds a new page as the last target, one write, and reads it back", async () => {
    const { repository, addNew, readProjectForPanel } = setup();

    await addNew(10, "负责人", "  王五 ");

    const [property] = (await readProjectForPanel(10))?.customProperties ?? [];
    expect(property?.targets).toEqual([
      { id: expect.any(Number), text: "王五", deleted: false },
    ]);
    expect(repository.writeCount()).toBe(1);
  });

  it("does nothing for a blank text", async () => {
    const { repository, addNew } = setup();

    await addNew(10, "负责人", "  ");

    expect(repository.writeCount()).toBe(0);
  });

  it("refuses, writing nothing, when the property is no longer a block reference property", async () => {
    const { repository, addNew } = setup();

    await expect(addNew(10, "客户", "王五")).rejects.toBeInstanceOf(
      CustomPropertyChangedError,
    );
    await expect(addNew(10, "已删", "王五")).rejects.toBeInstanceOf(
      CustomPropertyChangedError,
    );
    expect(repository.writeCount()).toBe(0);
  });
});
