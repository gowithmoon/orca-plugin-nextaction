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

  it("moves a task into a project block even when its parent task and place among the tasks stay the same (#157)", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 3 });
    const moveTask = createMoveTask({ repository });

    // Neither has a parent task, and 3 already comes after 1.
    await moveTask({ id: 3, target: 1, placement: "after" });

    expect(repository.moves()).toEqual([
      { id: 3, target: 1, placement: "after" },
    ]);
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

  it("hands placing a task before or after another task to the repository", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(10, { text: "Journal" });
    repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
    repository.addTask({ id: 2, text: "Book a van" }, { parentId: 10 });
    repository.addTask({ id: 3, text: "Clean" }, { parentId: 10 });
    const moveTask = createMoveTask({ repository });

    await moveTask({ id: 3, target: 1, placement: "before" });
    await moveTask({ id: 1, target: 2, placement: "after" });

    expect(repository.moves()).toEqual([
      { id: 3, target: 1, placement: "before" },
      { id: 1, target: 2, placement: "after" },
    ]);
    // Read back: Clean, Book a van, Pack.
    const { tasks } = await repository.readTaskGraph();
    const order = [...tasks]
      .sort((a, b) => a.position - b.position)
      .map((item) => item.task.text);
    expect(order).toEqual(["Clean", "Book a van", "Pack"]);
  });

  it("refuses to place a task that is not a page before or after a page task, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 1, text: "Move house" }, { page: true });
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    repository.addTask({ id: 3, text: "Garden" }, { page: true });
    const moveTask = createMoveTask({ repository });

    for (const placement of ["before", "after"] as const) {
      const refused = moveTask({ id: 2, target: 3, placement });
      await expect(refused).rejects.toBeInstanceOf(MoveRefusedError);
      await expect(refused).rejects.toMatchObject({
        reason: "page-level-only-pages",
      });
    }
    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  it("places a page task before or after another page task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(10, { text: "Projects" });
    // A page moved below a block earlier (move-blocks P1).
    repository.addTask(
      { id: 3, text: "Learn piano" },
      { page: true, parentId: 10 },
    );
    repository.addTask({ id: 1, text: "Move house" }, { page: true });
    repository.addTask({ id: 2, text: "Garden" }, { page: true });
    const moveTask = createMoveTask({ repository });

    await moveTask({ id: 2, target: 1, placement: "before" });
    await moveTask({ id: 3, target: 1, placement: "after" });

    expect(repository.moves()).toEqual([
      { id: 2, target: 1, placement: "before" },
      { id: 3, target: 1, placement: "after" },
    ]);
    // Read back: Garden, Move house, Learn piano.
    const { tasks } = await repository.readTaskGraph();
    const order = [...tasks]
      .sort((a, b) => a.position - b.position)
      .map((item) => item.task.text);
    expect(order).toEqual(["Garden", "Move house", "Learn piano"]);
  });

  it("refuses placing a task before or after a subtask of another parent when that would make a dependency cycle", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(10, { text: "Journal" });
    repository.addTask(
      { id: 1, text: "Move house", sequential: true },
      { parentId: 10 },
    );
    repository.addTask({ id: 2, text: "Pack" }, { parentId: 1 });
    // Waits for Get keys.
    repository.addTask(
      { id: 3, text: "Unpack", dependencies: [5] },
      { parentId: 1 },
    );
    // Waits for Pack: before it, Pack would wait for it in turn.
    repository.addTask(
      { id: 4, text: "Buy boxes", dependencies: [2] },
      { parentId: 10 },
    );
    // Waited for by Unpack: after it, it would wait for Unpack in turn.
    repository.addTask({ id: 5, text: "Get keys" }, { parentId: 10 });
    const moveTask = createMoveTask({ repository });

    const before = moveTask({ id: 4, target: 2, placement: "before" });
    await expect(before).rejects.toBeInstanceOf(DependencyCycleError);
    await expect(before).rejects.toMatchObject({
      cycle: { kind: "move", moved: { id: 4 }, cycleWith: { id: 2 } },
    });
    const after = moveTask({ id: 5, target: 3, placement: "after" });
    await expect(after).rejects.toBeInstanceOf(DependencyCycleError);
    await expect(after).rejects.toMatchObject({
      cycle: { kind: "move", moved: { id: 5 }, cycleWith: { id: 3 } },
    });
    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(0);
  });

  describe("to the end of a project block (#170)", () => {
    it("moves a task written outside the project block to its last child block, in one write", async () => {
      const repository = createInMemoryTaskRepository();
      repository.addProject({ id: 10, text: "Move house" });
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
      repository.addTask({ id: 2, text: "Unpack" }, { parentId: 1 });
      repository.addBlock(20, { text: "Journal" });
      repository.addTask({ id: 3, text: "Book a van" }, { parentId: 20 });
      const moveTask = createMoveTask({ repository });

      await moveTask({ id: 3, projectEnd: 10 });

      expect(repository.moves()).toEqual([{ id: 3, projectEnd: 10 }]);
      expect(repository.writeCount()).toBe(1);
      const { tasks } = await repository.readTaskGraph();
      const placeOf = (id: number) =>
        tasks.find((item) => item.task.id === id) as (typeof tasks)[number];
      expect(placeOf(3)).toMatchObject({ parentId: null, projectBlock: 10 });
      // After Pack and its subtask Unpack.
      expect(placeOf(3).position).toBeGreaterThan(placeOf(2).position);
    });

    it("writes nothing for a task already last among the project block's child blocks", async () => {
      const repository = createInMemoryTaskRepository();
      repository.addProject({ id: 10, text: "Move house" });
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
      repository.addTask({ id: 2, text: "Unpack" }, { parentId: 1 });
      repository.addTask({ id: 3, text: "Book a van" }, { parentId: 10 });
      const moveTask = createMoveTask({ repository });

      await moveTask({ id: 3, projectEnd: 10 });

      expect(repository.moves()).toEqual([]);
      expect(repository.writeCount()).toBe(0);
    });

    it("promotes a subtask below the project block to a project root task, last in the block", async () => {
      const repository = createInMemoryTaskRepository();
      repository.addProject({ id: 10, text: "Move house" }, { page: true });
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
      repository.addTask({ id: 2, text: "Wrap the plates" }, { parentId: 1 });
      repository.addTask({ id: 3, text: "Book a van" }, { parentId: 10 });
      const moveTask = createMoveTask({ repository });

      await moveTask({ id: 2, projectEnd: 10 });

      expect(repository.moves()).toEqual([{ id: 2, projectEnd: 10 }]);
      const { tasks } = await repository.readTaskGraph();
      const order = [...tasks]
        .sort((a, b) => a.position - b.position)
        .map((item) => [item.task.text, item.parentId, item.projectBlock]);
      expect(order).toEqual([
        ["Pack", null, 10],
        ["Book a van", null, 10],
        ["Wrap the plates", null, 10],
      ]);
    });

    it("refuses to move a task to the end of a project block that sits below it, writing nothing", async () => {
      const repository = createInMemoryTaskRepository();
      repository.addTask({ id: 1, text: "Life admin" });
      // A project block below a task (ADR 0025).
      repository.addProject({ id: 10, text: "Move house" }, { parentId: 1 });
      repository.addTask({ id: 2, text: "Pack" }, { parentId: 10 });
      // A block both a task and a project.
      repository.addTask({ id: 11, text: "Garden" });
      repository.addProject({ id: 11 });
      const moveTask = createMoveTask({ repository });

      for (const move of [
        { id: 1, projectEnd: 10 },
        { id: 11, projectEnd: 11 },
      ]) {
        const refused = moveTask(move);
        await expect(refused).rejects.toBeInstanceOf(MoveRefusedError);
        await expect(refused).rejects.toMatchObject({
          reason: "onto-self-or-below",
        });
      }
      expect(repository.writeCount()).toBe(0);
    });

    it("refuses a move to the end of a project block below a task when that would make a dependency cycle", async () => {
      const repository = createInMemoryTaskRepository();
      // Move house waits for Book a van; the project block sits below it.
      repository.addTask({ id: 1, text: "Move house", dependencies: [3] });
      repository.addProject({ id: 10, text: "Boxes" }, { parentId: 1 });
      repository.addTask({ id: 3, text: "Book a van" });
      const moveTask = createMoveTask({ repository });

      const refused = moveTask({ id: 3, projectEnd: 10 });

      await expect(refused).rejects.toBeInstanceOf(DependencyCycleError);
      await expect(refused).rejects.toMatchObject({
        cycle: { kind: "move", moved: { id: 3 }, cycleWith: { id: 1 } },
      });
      expect(repository.writeCount()).toBe(0);
    });
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
