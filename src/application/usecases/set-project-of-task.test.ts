import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createSetProjectOfTask } from "./set-project-of-task";

function setup() {
  const repository = createInMemoryTaskRepository();
  const setProjectOfTask = createSetProjectOfTask({ repository });
  /** The project task `id` sets for itself, as the task graph reads it. */
  const setting = async (id: number) =>
    (await repository.readTaskGraph()).tasks.find((t) => t.task.id === id)
      ?.projectSetting?.target ?? null;
  return { repository, setProjectOfTask, setting };
}

describe("set the project of a task", () => {
  it("sets a project on a task with none, in one write", async () => {
    const { repository, setProjectOfTask, setting } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 });

    await setProjectOfTask(1, 10);

    expect(await setting(1)).toBe(10);
    expect(repository.writeCount()).toBe(1);
  });

  it("changes the project, the old one no longer set", async () => {
    const { repository, setProjectOfTask, setting } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1 }, { project: [10] });

    await setProjectOfTask(1, 11);

    expect(await setting(1)).toBe(11);
  });

  it("clears the project", async () => {
    const { repository, setProjectOfTask } = setup();
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { project: [10] });

    await setProjectOfTask(1, null);

    const graph = await repository.readTaskGraph();
    expect(graph.tasks[0]?.projectSetting).toBeUndefined();
    expect(repository.writeCount()).toBe(1);
  });

  it("an edit replaces a stale setting in the same write", async () => {
    const { repository, setProjectOfTask, setting } = setup();
    // 7 had its project tag removed in Orca: the setting is stale.
    repository.addBlock(7);
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { project: [7] });

    await setProjectOfTask(1, 10);

    expect(await setting(1)).toBe(10);
    expect(repository.writeCount()).toBe(1);
  });

  it("a block that is no longer a project clears the setting instead", async () => {
    const { repository, setProjectOfTask } = setup();
    repository.addBlock(7);
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { project: [10] });

    await setProjectOfTask(1, 7);

    const graph = await repository.readTaskGraph();
    expect(graph.tasks[0]?.projectSetting).toBeUndefined();
  });

  it("a task that is also a project is not its own project", async () => {
    const { repository, setProjectOfTask } = setup();
    repository.addTask({ id: 1 });
    repository.addProject({ id: 1 });

    await setProjectOfTask(1, 1);

    const graph = await repository.readTaskGraph();
    expect(graph.tasks[0]?.projectSetting).toBeUndefined();
  });
});
