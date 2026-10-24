import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { NotAProjectError } from "../ports/task-repository";
import { createEditProject } from "./edit-project";

describe("edit project", () => {
  it("writes only the properties passed, leaving the others as they are, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({
      id: 10,
      status: "active",
      goal: "Move in",
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 12, day: 31 },
      importance: 2,
      urgency: 3,
    });
    const editProject = createEditProject({ repository });

    await editProject(10, { importance: 6, goal: "Move in by winter" });

    expect(await repository.getProject(10)).toMatchObject({
      status: "active",
      goal: "Move in by winter",
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 12, day: 31 },
      importance: 6,
      urgency: 3,
    });
    expect(repository.writeCount()).toBe(1);
  });

  it("clears the start, the due and the goal", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({
      id: 10,
      goal: "Move in",
      start: { year: 2026, month: 10, day: 1 },
      due: { year: 2026, month: 12, day: 31 },
    });
    const editProject = createEditProject({ repository });

    await editProject(10, { start: null, due: null, goal: null });

    expect(await repository.getProject(10)).toMatchObject({
      start: null,
      due: null,
      goal: null,
    });
  });

  it("fails with not a project, writing nothing, for a block that is not one", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(20);
    repository.addTask({ id: 21, urgency: 2 });
    const editProject = createEditProject({ repository });

    for (const id of [20, 21, 22]) {
      await expect(editProject(id, { urgency: 7 })).rejects.toBeInstanceOf(
        NotAProjectError,
      );
    }
    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(21))?.urgency).toBe(2);
  });

  it("fails as paused, not as not a project, while the project tag is paused", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10 });
    repository.pauseProjectTag(true);
    const editProject = createEditProject({ repository });

    const failure = editProject(10, { urgency: 7 }).catch((error) => error);
    expect(await failure).not.toBeInstanceOf(NotAProjectError);
    expect(String(await failure)).toContain("paused");
    expect(repository.writeCount()).toBe(0);
  });

  it("edits the project of a block that is also a task, not the task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 30, importance: 2, due: null });
    repository.addProject({ id: 30, importance: 4 });
    const editProject = createEditProject({ repository });

    await editProject(30, {
      importance: 7,
      due: { year: 2026, month: 11, day: 1 },
    });

    expect(await repository.getProject(30)).toMatchObject({
      importance: 7,
      due: { year: 2026, month: 11, day: 1 },
    });
    expect(await repository.getTask(30)).toMatchObject({
      importance: 2,
      due: null,
    });
  });

  it("writes nothing when the write fails, and says why", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, urgency: 3 });
    repository.failWrites(new Error("no editor"));
    const editProject = createEditProject({ repository });

    await expect(editProject(10, { urgency: 7 })).rejects.toThrow("no editor");
    expect((await repository.getProject(10))?.urgency).toBe(3);
  });
});
