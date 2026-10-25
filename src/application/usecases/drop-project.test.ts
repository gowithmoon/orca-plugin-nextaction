import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { NotAProjectError } from "../ports/task-repository";
import { createDropProject, createReadDropProjectPlan } from "./drop-project";

describe("drop project", () => {
  it("removes the project tag and drops the open tasks under the project block, keeping the done ones, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "doing" }, { parentId: 10 });
    repository.addTask({ id: 12, status: "done" }, { parentId: 10 });
    repository.addTask({ id: 13, status: "todo" }, { parentId: 12 });
    const dropProject = createDropProject({ repository });

    await dropProject(10);

    expect(await repository.getProject(10)).toBeNull();
    expect(await repository.getTask(11)).toBeNull();
    expect((await repository.getTask(12))?.status).toBe("done");
    // Open, though under a done task: it is dropped too.
    expect(await repository.getTask(13)).toBeNull();
    expect(repository.writeCount()).toBe(1);
  });

  it("counts and drops the tasks set to it elsewhere with their subtasks, parent task first", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addProject({ id: 20, status: "active" });
    repository.addTask({ id: 11, status: "todo" }, { parentId: 10 });
    // Set to 10 elsewhere in the notes, with a subtask set to 20: the parent
    // task decides, so both belong to 10.
    repository.addTask({ id: 30, status: "todo" }, { project: [10] });
    repository.addTask(
      { id: 31, status: "waiting" },
      { parentId: 30, project: [20] },
    );
    // Under 10's block but set to 20: it belongs to 20, and so does its subtask.
    repository.addTask(
      { id: 12, status: "todo" },
      { parentId: 10, project: [20] },
    );
    repository.addTask({ id: 13, status: "todo" }, { parentId: 12 });
    const readPlan = createReadDropProjectPlan({ repository });
    const dropProject = createDropProject({ repository });

    expect(await readPlan(10)).toMatchObject({
      project: { id: 10 },
      openTasks: 3,
    });
    await dropProject(10);

    for (const id of [11, 30, 31]) {
      expect(await repository.getTask(id)).toBeNull();
    }
    expect((await repository.getTask(12))?.status).toBe("todo");
    expect((await repository.getTask(13))?.status).toBe("todo");
    expect(await repository.getProject(20)).not.toBeNull();
    expect(repository.writeCount()).toBe(1);
  });

  it("clears every setting pointing at it, done tasks' and overruled ones' too, leaving the others", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addProject({ id: 20, status: "active" });
    repository.addTask({ id: 30, status: "done" }, { project: [10] });
    // Overruled by its parent task's setting: it belongs to 20, yet its own
    // setting points at 10.
    repository.addTask({ id: 40, status: "todo" }, { project: [20] });
    repository.addTask(
      { id: 41, status: "todo" },
      { parentId: 40, project: [10] },
    );
    repository.addTask({ id: 50, status: "todo" }, { project: [20] });
    const dropProject = createDropProject({ repository });

    await dropProject(10);

    const settings = new Map(
      (await repository.readTaskGraph()).tasks.map((item) => [
        item.task.id,
        item.projectSetting?.target ?? null,
      ]),
    );
    expect(settings).toEqual(
      new Map([
        [30, null],
        [40, 20],
        [41, null],
        [50, 20],
      ]),
    );
    expect((await repository.getTask(30))?.status).toBe("done");
    expect((await repository.getTask(41))?.status).toBe("todo");
    expect(repository.writeCount()).toBe(1);
  });

  it("clears the dependencies on the tasks it drops, keeping the others", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "todo" }, { parentId: 10 });
    repository.addTask({ id: 12, status: "done" }, { parentId: 10 });
    repository.addTask({ id: 60, status: "todo", dependencies: [11, 12] });
    const dropProject = createDropProject({ repository });

    await dropProject(10);

    expect((await repository.getTask(60))?.dependencies).toEqual([12]);
    expect(repository.writeCount()).toBe(1);
  });

  it("with no open task, plans none and drops only the project tag", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "planning" });
    repository.addTask({ id: 11, status: "done" }, { parentId: 10 });
    repository.addTask({ id: 12, status: "todo" });
    const readPlan = createReadDropProjectPlan({ repository });
    const dropProject = createDropProject({ repository });

    expect((await readPlan(10)).openTasks).toBe(0);
    await dropProject(10);

    expect(await repository.getProject(10)).toBeNull();
    expect((await repository.getTask(11))?.status).toBe("done");
    expect((await repository.getTask(12))?.status).toBe("todo");
    expect(repository.writeCount()).toBe(1);
  });

  it("drops a project that is also a task without dropping the task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 10, status: "todo" });
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "todo" }, { parentId: 10 });
    const readPlan = createReadDropProjectPlan({ repository });
    const dropProject = createDropProject({ repository });

    // 11's parent task is 10, which has no project: the project block counts.
    expect((await readPlan(10)).openTasks).toBe(1);
    await dropProject(10);

    expect((await repository.getTask(10))?.status).toBe("todo");
    expect(await repository.getTask(11)).toBeNull();
  });

  it("fails as a whole when the write fails", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "todo" }, { parentId: 10 });
    repository.addTask({ id: 30, status: "done" }, { project: [10] });
    const failure = new Error("no editor");
    repository.failWrites(failure);
    const dropProject = createDropProject({ repository });

    await expect(dropProject(10)).rejects.toBe(failure);
    expect(await repository.getProject(10)).not.toBeNull();
    expect((await repository.getTask(11))?.status).toBe("todo");
    const snapshot = await repository.readTaskGraph();
    expect(
      snapshot.tasks.find((item) => item.task.id === 30)?.projectSetting
        ?.target,
    ).toBe(10);
  });

  it("fails with not a project for a block that is not one, writing nothing", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(20);
    repository.addTask({ id: 21, status: "todo" });
    const readPlan = createReadDropProjectPlan({ repository });
    const dropProject = createDropProject({ repository });

    for (const id of [20, 21, 22]) {
      await expect(readPlan(id)).rejects.toBeInstanceOf(NotAProjectError);
      await expect(dropProject(id)).rejects.toBeInstanceOf(NotAProjectError);
    }
    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(21))?.status).toBe("todo");
  });
});
