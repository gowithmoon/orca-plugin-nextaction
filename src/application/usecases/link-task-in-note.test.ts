import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { NoteTarget } from "../ports/task-repository";
import { createLinkTaskInNote } from "./link-task-in-note";

/** A drop target as ui finds it; the use case does not look inside. */
const target: NoteTarget = {
  panelId: "panel-1",
  rootBlockId: 40,
  blockId: 50,
  caret: null,
};

describe("link task in note", () => {
  it("hands the plan and the target to the repository as they are", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Pack" });
    const linkTaskInNote = createLinkTaskInNote({ repository });

    await linkTaskInNote({
      id: 1,
      plan: { kind: "newBlock", content: "ref", placement: "after" },
      target,
    });

    expect(repository.noteLinks()).toEqual([
      {
        id: 1,
        plan: { kind: "newBlock", content: "ref", placement: "after" },
        target,
      },
    ]);
  });

  it("changes no task relation, even with the target below another task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Pack", dependencies: [3] });
    repository.addTask({ id: 3, text: "Buy boxes" });
    // The dropped-on block sits below task 1.
    repository.addBlock(50, { parentId: 1 });
    const before = await repository.readTaskGraph();
    const linkTaskInNote = createLinkTaskInNote({ repository });

    await linkTaskInNote({
      id: 2,
      plan: { kind: "newBlock", content: "ref", placement: "before" },
      target,
    });

    expect(repository.moves()).toEqual([]);
    expect(await repository.readTaskGraph()).toEqual(before);
    expect((await repository.getTask(2))?.dependencies).toEqual([3]);
  });

  it("fails as the repository fails", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });
    repository.failWrites(new Error("no panel"));
    const linkTaskInNote = createLinkTaskInNote({ repository });

    await expect(
      linkTaskInNote({
        id: 1,
        plan: { kind: "newBlock", content: "ref", placement: "after" },
        target,
      }),
    ).rejects.toThrow("no panel");
    expect(repository.noteLinks()).toEqual([]);
  });
});
