import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { DependencyCycleError } from "./dependency-cycle-error";
import { createMoveTask, MoveRefusedError } from "./move-task";

describe("move task", () => {
  it("refuses to move a task onto itself or a descendant task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });
    repository.addBlock(2, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 2 });
    const moveTask = createMoveTask({ repository });

    for (const target of [1, 3]) {
      const refused = moveTask({ id: 1, target, placement: "lastChild" });
      await expect(refused).rejects.toBeInstanceOf(MoveRefusedError);
      await expect(refused).rejects.toMatchObject({
        reason: "onto-self-or-below",
      });
    }
    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("refuses a move that would make a dependency cycle, naming the task it would make one with, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house", dependencies: [2] });
    repository.addTask({ id: 2, text: "Pack" });
    const moveTask = createMoveTask({ repository });

    const refused = moveTask({ id: 2, target: 1, placement: "lastChild" });

    await expect(refused).rejects.toBeInstanceOf(DependencyCycleError);
    await expect(refused).rejects.toMatchObject({
      cycle: {
        kind: "move",
        moved: { id: 2, text: "Pack" },
        cycleWith: { id: 1, text: "Move house" },
      },
    });
    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing when the task would stay where it is", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2 }, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 1 });
    const moveTask = createMoveTask({ repository });

    // 3 is already the last subtask of 1, and right after 2.
    await moveTask({ id: 3, target: 1, placement: "lastChild" });
    await moveTask({ id: 3, target: 2, placement: "after" });
    await moveTask({ id: 2, target: 3, placement: "before" });

    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("hands any other move to the repository with the target and placement given, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Book a van" });
    repository.addBlock(4, { parentId: 3, text: "Ask for a quote" });
    const moveTask = createMoveTask({ repository });

    await moveTask({ id: 3, target: 1, placement: "lastChild" });

    expect(repository.moves()).toEqual([
      { id: 3, target: 1, placement: "lastChild" },
    ]);
    expect(repository.writeCount()).toBe(1);
    // Read back: 3 is now 1's last subtask, after 2.
    const { tasks } = await repository.readTaskGraph();
    const placeOf = (id: number) =>
      tasks.find((item) => item.task.id === id) as (typeof tasks)[number];
    expect(placeOf(3).parentId).toBe(1);
    expect(placeOf(3).position).toBeGreaterThan(placeOf(2).position);
  });

  it("fails as the repository fails, having refused nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2 });
    repository.failWrites(new Error("no panel"));
    const moveTask = createMoveTask({ repository });

    await expect(
      moveTask({ id: 2, target: 1, placement: "lastChild" }),
    ).rejects.toThrow("no panel");
    expect(repository.moves()).toEqual([]);
  });
});
