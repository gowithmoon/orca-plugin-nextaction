import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  createCreateSubtask,
  createReadSubtaskProject,
} from "./create-subtask";
import { createReadProjectOfTask } from "./read-project-of-task";

function setup() {
  const repository = createInMemoryTaskRepository();
  const createSubtask = createCreateSubtask({ repository });
  return { repository, createSubtask };
}

/** The tasks directly below `parentId`, in note order. */
async function childrenOf(
  repository: ReturnType<typeof createInMemoryTaskRepository>,
  parentId: number,
) {
  const { tasks } = await repository.readTaskGraph();
  return tasks
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((item) => item.task.id);
}

describe("create a subtask", () => {
  it.each(["", "   ", "\t\n "])(
    "writes nothing for blank text %j",
    async (text) => {
      const { repository, createSubtask } = setup();
      repository.addTask({ id: 1 });

      expect(await createSubtask(1, text)).toEqual({ kind: "empty" });
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("writes nothing for blank text, even with initial properties", async () => {
    const { repository, createSubtask } = setup();
    repository.addTask({ id: 1 });

    expect(await createSubtask(1, "  ", { importance: 7 })).toEqual({
      kind: "empty",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("creates an inbox task with the trimmed text below the parent task, in one write", async () => {
    const { repository, createSubtask } = setup();
    repository.addTask({ id: 1, status: "doing" });

    const result = await createSubtask(1, "  Pack the books  ");

    if (result.kind !== "created") throw new Error("not created");
    expect(await repository.getTask(result.id)).toMatchObject({
      text: "Pack the books",
      status: "inbox",
      importance: 4,
      urgency: 4,
      effort: 4,
      start: null,
      due: null,
    });
    expect(await childrenOf(repository, 1)).toEqual([result.id]);
    expect(repository.writeCount()).toBe(1);
  });

  it("puts the subtask after the subtasks already there, and their own subtasks", async () => {
    const { repository, createSubtask } = setup();
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2 }, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 2 });
    repository.addTask({ id: 4 }, { parentId: 1 });
    repository.addTask({ id: 5 });

    const result = await createSubtask(1, "Last one");

    if (result.kind !== "created") throw new Error("not created");
    expect(await childrenOf(repository, 1)).toEqual([2, 4, result.id]);
    const { tasks } = await repository.readTaskGraph();
    const positionOf = (id: number) =>
      tasks.find((item) => item.task.id === id)?.position ?? Number.NaN;
    expect(positionOf(result.id)).toBeGreaterThan(positionOf(3));
    expect(positionOf(result.id)).toBeGreaterThan(positionOf(4));
    expect(positionOf(result.id)).toBeLessThan(positionOf(5));
  });

  it("writes the initial properties given, the others keep their defaults", async () => {
    const { repository, createSubtask } = setup();
    repository.addTask({ id: 1 });

    const result = await createSubtask(1, "Call the movers", {
      importance: 6,
      effort: 2,
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 10, day: 24 },
    });

    if (result.kind !== "created") throw new Error("not created");
    expect(await repository.getTask(result.id)).toMatchObject({
      status: "inbox",
      importance: 6,
      urgency: 4,
      effort: 2,
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 10, day: 24 },
    });
  });

  it("belongs to the parent task's project, with no setting of its own", async () => {
    const { repository, createSubtask } = setup();
    repository.addProject({ id: 10, text: "Move house", status: "active" });
    repository.addTask({ id: 1 }, { project: [10] });

    const result = await createSubtask(1, "Pack the books");

    if (result.kind !== "created") throw new Error("not created");
    const read = await createReadProjectOfTask({ repository })(result.id);
    expect(read.project?.id).toBe(10);
    expect(read.source).toEqual({
      kind: "parentTask",
      task: { id: 1, text: "" },
    });
    expect(read.ownSetting).toBeNull();
  });

  it("fails, writing nothing, when the parent is not a task", async () => {
    const { repository, createSubtask } = setup();
    repository.addBlock(1, { text: "Just a note" });

    await expect(createSubtask(1, "Pack the books")).rejects.toThrow();
    expect(repository.writeCount()).toBe(0);
  });

  it("fails, writing nothing, when the write fails", async () => {
    const { repository, createSubtask } = setup();
    repository.addTask({ id: 1 });
    repository.failWrites(new Error("no editor"));

    await expect(createSubtask(1, "Pack the books")).rejects.toThrow(
      "no editor",
    );
    expect(await childrenOf(repository, 1)).toEqual([]);
  });
});

describe("read the project of a new subtask", () => {
  const moveHouse = { id: 10, text: "Move house", status: "active" } as const;

  it("is none when the parent task belongs to no project", async () => {
    const { repository } = setup();
    repository.addTask({ id: 1 });

    expect(await createReadSubtaskProject({ repository })(1)).toBeNull();
  });

  it("is the parent task's project", async () => {
    const { repository } = setup();
    repository.addProject(moveHouse);
    repository.addTask({ id: 1 }, { parentId: 10 });

    expect(await createReadSubtaskProject({ repository })(1)).toEqual(
      moveHouse,
    );
  });

  it("is the parent itself when the parent task is also a project block", async () => {
    const { repository } = setup();
    repository.addTask({ id: 10 });
    repository.addProject(moveHouse);

    expect(await createReadSubtaskProject({ repository })(10)).toEqual(
      moveHouse,
    );
  });

  it("is none while the project tag is paused", async () => {
    const { repository } = setup();
    repository.addTask({ id: 10 });
    repository.addProject(moveHouse);
    repository.pauseProjectTag(true);

    expect(await createReadSubtaskProject({ repository })(10)).toBeNull();
  });
});
