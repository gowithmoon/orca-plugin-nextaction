import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadMoveCrossing } from "./read-move-crossing";

const moveHouse = { id: 10, text: "Move house", status: "active" } as const;
const trip = { id: 11, text: "Year-end trip", status: "active" } as const;

function setup() {
  const repository = createInMemoryTaskRepository();
  const readMoveCrossing = createReadMoveCrossing({ repository });
  return { repository, readMoveCrossing };
}

describe("read whether a move crosses the project block (#157)", () => {
  it("a task moved into the project block, set to the project, moves in", async () => {
    const { repository, readMoveCrossing } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
    repository.addTask({ id: 3, text: "Book a van" }, { project: [10] });

    expect(
      await readMoveCrossing({ id: 3, target: 1, placement: "after" }, 10),
    ).toEqual({
      kind: "moveIn",
      task: "Book a van",
      project: "Move house",
    });
  });

  it("a task moved out of the project block to a task of no project names the project it leaves", async () => {
    const { repository, readMoveCrossing } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
    repository.addTask({ id: 3, text: "Water the plants" });

    expect(
      await readMoveCrossing({ id: 1, target: 3, placement: "lastChild" }, 10),
    ).toEqual({ kind: "noProject", task: "Pack", project: "Move house" });
  });

  it("a task moved out by its own setting to another project names that project", async () => {
    const { repository, readMoveCrossing } = setup();
    repository.addProject(moveHouse);
    repository.addProject(trip);
    repository.addTask({ id: 1, text: "Plan" }, { parentId: 10 });
    // Its parent task decides while it is below it.
    repository.addTask({ id: 2, text: "Book" }, { parentId: 1, project: [11] });
    repository.addBlock(20, { text: "Home" });
    repository.addTask({ id: 3, text: "Water the plants" }, { parentId: 20 });

    expect(
      await readMoveCrossing({ id: 2, target: 3, placement: "after" }, 10),
    ).toEqual({
      kind: "otherProject",
      task: "Book",
      project: "Move house",
      otherProject: "Year-end trip",
    });
  });

  it("a move that does not cross the boundary asks nothing", async () => {
    const { repository, readMoveCrossing } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 2 }, { parentId: 10 });

    expect(
      await readMoveCrossing({ id: 2, target: 1, placement: "lastChild" }, 10),
    ).toBeNull();
  });

  describe("to the end of the project block (#170)", () => {
    it("a task written outside a page project's block, set to it, moves in", async () => {
      const { repository, readMoveCrossing } = setup();
      repository.addProject(moveHouse, { page: true });
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
      repository.addBlock(20, { text: "Journal" });
      repository.addTask(
        { id: 3, text: "Book a van" },
        { parentId: 20, project: [10] },
      );

      expect(await readMoveCrossing({ id: 3, projectEnd: 10 }, 10)).toEqual({
        kind: "moveIn",
        task: "Book a van",
        project: "Move house",
      });
    });

    it("a subtask below a block project, promoted to a project root task, asks nothing", async () => {
      const { repository, readMoveCrossing } = setup();
      repository.addBlock(20, { text: "Journal" });
      repository.addProject(moveHouse, { parentId: 20 });
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });
      repository.addTask({ id: 2, text: "Wrap the plates" }, { parentId: 1 });

      expect(await readMoveCrossing({ id: 2, projectEnd: 10 }, 10)).toBeNull();
    });

    it("to a project block below a task set to another project, it names that project (ADR 0025)", async () => {
      const { repository, readMoveCrossing } = setup();
      repository.addProject(trip);
      repository.addTask({ id: 1, text: "Life admin" }, { project: [11] });
      // Project 10's block sits below task 1.
      repository.addProject(moveHouse, { parentId: 1 });
      repository.addTask({ id: 3, text: "Pack" }, { project: [10] });
      repository.addTask({ id: 4, text: "Wrap the plates" }, { parentId: 3 });

      expect(await readMoveCrossing({ id: 4, projectEnd: 10 }, 10)).toEqual({
        kind: "otherProject",
        task: "Wrap the plates",
        project: "Move house",
        otherProject: "Year-end trip",
      });
    });

    it("a task already last in the project block asks nothing", async () => {
      const { repository, readMoveCrossing } = setup();
      repository.addProject(moveHouse);
      repository.addTask({ id: 1, text: "Pack" }, { parentId: 10 });

      expect(await readMoveCrossing({ id: 1, projectEnd: 10 }, 10)).toBeNull();
      expect(repository.writeCount()).toBe(0);
    });
  });

  it("a crossing move the move would refuse asks nothing", async () => {
    const { repository, readMoveCrossing } = setup();
    repository.addProject(moveHouse);
    // 1 depends on 3: 3 below 1 would make a dependency cycle.
    repository.addTask({ id: 1, dependencies: [3] }, { parentId: 10 });
    repository.addTask({ id: 3 }, { project: [10] });
    // A page at the top of the notes: only a page goes next to it.
    repository.addTask({ id: 4 }, { page: true });
    repository.addTask({ id: 5 }, { parentId: 10 });

    expect(
      await readMoveCrossing({ id: 3, target: 1, placement: "lastChild" }, 10),
    ).toBeNull();
    expect(
      await readMoveCrossing({ id: 5, target: 4, placement: "after" }, 10),
    ).toBeNull();
    // Onto a task below itself.
    expect(
      await readMoveCrossing({ id: 3, target: 3, placement: "lastChild" }, 10),
    ).toBeNull();
    expect(repository.writeCount()).toBe(0);
  });
});
