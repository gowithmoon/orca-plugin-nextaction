import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { NotAProjectError } from "../ports/task-repository";
import { createChangeProjectStatus } from "./change-project-status";

describe("change project status", () => {
  it("writes the chosen project status, in one write", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "planning" });
    const changeProjectStatus = createChangeProjectStatus({ repository });

    await changeProjectStatus(10, "active");

    expect((await repository.getProject(10))?.status).toBe("active");
    expect(repository.writeCount()).toBe(1);
  });

  it("fails with not a project for a block without the project tag, or none at all", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addBlock(20);
    repository.addTask({ id: 21, status: "todo" });
    const changeProjectStatus = createChangeProjectStatus({ repository });

    for (const id of [20, 21, 22]) {
      await expect(changeProjectStatus(id, "active")).rejects.toBeInstanceOf(
        NotAProjectError,
      );
    }
    expect(repository.writeCount()).toBe(0);
    expect((await repository.getTask(21))?.status).toBe("todo");
  });

  it("fails as paused, not as not a project, while the project tag is paused", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "planning" });
    repository.pauseProjectTag(true);
    const changeProjectStatus = createChangeProjectStatus({ repository });

    const failure = changeProjectStatus(10, "active").catch((error) => error);
    expect(await failure).not.toBeInstanceOf(NotAProjectError);
    expect(String(await failure)).toContain("paused");
    expect(repository.writeCount()).toBe(0);
  });

  it("writes it again when the project already holds it, repairing an unknown one", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "planning" });
    const changeProjectStatus = createChangeProjectStatus({ repository });

    await changeProjectStatus(10, "planning");

    expect(repository.writeCount()).toBe(1);
  });

  it("leaves the tasks belonging to it as they are when it is done", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 11, status: "doing" }, { parentId: 10 });
    repository.addTask({ id: 12, status: "todo" }, { parentId: 11 });
    const changeProjectStatus = createChangeProjectStatus({ repository });

    await changeProjectStatus(10, "done");

    expect((await repository.getProject(10))?.status).toBe("done");
    expect((await repository.getTask(11))?.status).toBe("doing");
    expect((await repository.getTask(12))?.status).toBe("todo");
    expect(repository.writeCount()).toBe(1);
  });

  it("changes the project of a block that is also a task, not the task", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addTask({ id: 30, status: "todo" });
    repository.addProject({ id: 30, status: "planning" });
    const changeProjectStatus = createChangeProjectStatus({ repository });

    await changeProjectStatus(30, "paused");

    expect((await repository.getProject(30))?.status).toBe("paused");
    expect((await repository.getTask(30))?.status).toBe("todo");
  });

  it("writes nothing when the write fails, and says why", async () => {
    const repository = createInMemoryTaskRepository();
    repository.addProject({ id: 10, status: "planning" });
    repository.failWrites(new Error("no editor"));
    const changeProjectStatus = createChangeProjectStatus({ repository });

    await expect(changeProjectStatus(10, "active")).rejects.toThrow(
      "no editor",
    );
    expect((await repository.getProject(10))?.status).toBe("planning");
  });
});
