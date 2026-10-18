import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createCreateSplitSubtasks } from "./create-split-subtasks";
import { DependencyCycleError } from "./dependency-cycle-error";

function setup() {
  const repository = createInMemoryTaskRepository();
  const createSplitSubtasks = createCreateSplitSubtasks({ repository });
  return { repository, createSplitSubtasks };
}

/** The tasks directly below `parentId`, in note order, with text and status. */
async function childrenOf(
  repository: ReturnType<typeof createInMemoryTaskRepository>,
  parentId: number,
) {
  const { tasks } = await repository.readTaskGraph();
  return tasks
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((item) => ({ text: item.task.text, status: item.task.status }));
}

describe("create the split subtasks", () => {
  it("creates them as todo subtasks after the task's existing child blocks, in the draft's order, in one write", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Find a flat" }, { parentId: 1 });
    repository.addBlock(3, { text: "A note", parentId: 1 });

    const result = await createSplitSubtasks(1, {
      titles: ["Book the movers", "Pack the books"],
      sequential: false,
    });

    expect(result).toEqual({ kind: "created", count: 2 });
    expect(await childrenOf(repository, 1)).toEqual([
      { text: "Find a flat", status: "inbox" },
      { text: "Book the movers", status: "todo" },
      { text: "Pack the books", status: "todo" },
    ]);
    expect(repository.writeCount()).toBe(1);
  });

  it("switches the parent's sequential on in the same write when asked", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });

    await createSplitSubtasks(1, {
      titles: ["Book the movers", "Pack the books"],
      sequential: true,
    });

    expect((await repository.getTask(1))?.sequential).toBe(true);
    expect(repository.writeCount()).toBe(1);
  });

  it("leaves the parent's sequential as it is when not asked", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });

    await createSplitSubtasks(1, { titles: ["Pack"], sequential: false });

    expect((await repository.getTask(1))?.sequential).toBe(false);
  });

  it("trims the names and skips the blank ones", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });

    const result = await createSplitSubtasks(1, {
      titles: ["  Book the movers ", "", "   ", "Pack"],
      sequential: false,
    });

    expect(result).toEqual({ kind: "created", count: 2 });
    expect(await childrenOf(repository, 1)).toEqual([
      { text: "Book the movers", status: "todo" },
      { text: "Pack", status: "todo" },
    ]);
  });

  it.each([[[]], [["", "  "]]])(
    "writes nothing when no name is left (%j), sequential or not",
    async (titles) => {
      const { repository, createSplitSubtasks } = setup();
      repository.addTask({ id: 1, text: "Move house" });

      expect(
        await createSplitSubtasks(1, { titles, sequential: true }),
      ).toEqual({ kind: "empty" });
      expect(repository.writeCount()).toBe(0);
      expect((await repository.getTask(1))?.sequential).toBe(false);
    },
  );

  it("refuses sequential that would make a dependency cycle, writing nothing", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });
    // The first subtask waits for the second: in order, the second would
    // wait for the first.
    repository.addTask(
      { id: 2, text: "Pack", dependencies: [3] },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, text: "Buy boxes" }, { parentId: 1 });

    await expect(
      createSplitSubtasks(1, { titles: ["Book the movers"], sequential: true }),
    ).rejects.toBeInstanceOf(DependencyCycleError);
    expect(repository.writeCount()).toBe(0);
  });

  it("fails, writing nothing, when the write fails", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addTask({ id: 1, text: "Move house" });
    repository.failWrites(new Error("no editor"));

    await expect(
      createSplitSubtasks(1, { titles: ["Pack"], sequential: true }),
    ).rejects.toThrow("no editor");
    expect(await childrenOf(repository, 1)).toEqual([]);
    expect((await repository.getTask(1))?.sequential).toBe(false);
  });

  it("fails, writing nothing, when the parent is not a task", async () => {
    const { repository, createSplitSubtasks } = setup();
    repository.addBlock(1, { text: "Just a note" });

    await expect(
      createSplitSubtasks(1, { titles: ["Pack"], sequential: false }),
    ).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });
});
