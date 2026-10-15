import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadProjectOfTask } from "./read-project-of-task";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectOfTask = createReadProjectOfTask({ repository });
  return { repository, readProjectOfTask };
}

const moveHouse = { id: 10, text: "Move house", status: "active" } as const;

describe("read the project of a task", () => {
  it("a task with no project reads as none", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addTask({ id: 1 });

    expect(await readProjectOfTask(1)).toEqual({
      project: null,
      source: null,
      ownSetting: null,
    });
  });

  it("a task's own setting decides: its source is its own", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1 }, { project: [10] });

    expect(await readProjectOfTask(1)).toEqual({
      project: moveHouse,
      source: { kind: "own" },
      ownSetting: null,
    });
  });

  it("a task below a project block reads as decided by its location", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1 }, { parentId: 10 });
    // Its subtask sits in the same project block: still its location.
    repository.addTask({ id: 2 }, { parentId: 1 });

    expect((await readProjectOfTask(1)).source).toEqual({ kind: "location" });
    expect((await readProjectOfTask(2)).source).toEqual({ kind: "location" });
    expect((await readProjectOfTask(2)).project).toEqual(moveHouse);
  });

  it("a parent task's setting decides: the task's own setting does not count", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addProject(moveHouse);
    repository.addProject({ id: 11, text: "Year-end trip", status: "paused" });
    repository.addTask({ id: 1, text: "Renovation plan" }, { project: [10] });
    repository.addTask({ id: 2 }, { parentId: 1, project: [11] });

    expect(await readProjectOfTask(2)).toEqual({
      project: moveHouse,
      source: { kind: "parentTask", task: { id: 1, text: "Renovation plan" } },
      ownSetting: {
        kind: "overridden",
        project: { id: 11, text: "Year-end trip", status: "paused" },
      },
    });
  });

  it("an ancestor task in another project block decides for the branch", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1, text: "Renovation plan" }, { parentId: 10 });
    repository.addBlock(5, { parentId: 1 });
    repository.addTask({ id: 2 }, { parentId: 5 });
    // A subtask in a project block of its own, below the branch's.
    repository.addProject({ id: 11, text: "Kitchen" }, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 11 });

    expect((await readProjectOfTask(2)).source).toEqual({ kind: "location" });
    expect(await readProjectOfTask(3)).toMatchObject({
      project: moveHouse,
      source: { kind: "parentTask", task: { id: 1, text: "Renovation plan" } },
      ownSetting: null,
    });
  });

  it("a setting naming a block no longer a project is stale and counts as none", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addBlock(7);
    repository.addProject(moveHouse);
    repository.addTask({ id: 1 }, { parentId: 10, project: [7] });
    repository.addTask({ id: 2 }, { project: [null] });

    expect(await readProjectOfTask(1)).toEqual({
      project: moveHouse,
      source: { kind: "location" },
      ownSetting: { kind: "stale" },
    });
    expect(await readProjectOfTask(2)).toEqual({
      project: null,
      source: null,
      ownSetting: { kind: "stale" },
    });
  });

  it("a block that is not a task reads as none", async () => {
    const { repository, readProjectOfTask } = setup();
    repository.addBlock(7);

    expect(await readProjectOfTask(7)).toEqual({
      project: null,
      source: null,
      ownSetting: null,
    });
  });
});
