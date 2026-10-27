import { describe, expect, it } from "vitest";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createDropProject } from "./drop-project";
import { createQuickCaptureInProject } from "./quick-capture-in-project";
import { createReadProjectOfTask } from "./read-project-of-task";

function setup() {
  const repository = createInMemoryTaskRepository();
  const quickCaptureInProject = createQuickCaptureInProject({ repository });
  return { repository, quickCaptureInProject };
}

describe("quick capture in a project", () => {
  it.each(["", "   ", "\t\n "])(
    "writes nothing for blank text %j",
    async (text) => {
      const { repository, quickCaptureInProject } = setup();
      repository.addProject({ id: 10, text: "Move house" });

      expect(await quickCaptureInProject(10, text)).toEqual({ kind: "empty" });
      expect(repository.writeCount()).toBe(0);
    },
  );

  it("creates an inbox task with the trimmed text as the last child block of the project block, in one write", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house", status: "active" });
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 2 }, { parentId: 1 });
    repository.addBlock(3, { parentId: 10, text: "A note" });
    repository.addTask({ id: 4 });

    const result = await quickCaptureInProject(10, "  Pack the books  ");

    if (result.kind !== "captured") throw new Error("not captured");
    expect(await repository.getTask(result.id)).toMatchObject({
      text: "Pack the books",
      status: "inbox",
      importance: 4,
      urgency: 4,
      effort: 4,
      start: null,
      due: null,
    });
    const { tasks } = await repository.readTaskGraph();
    const entryOf = (id: number) => tasks.find((item) => item.task.id === id);
    const positionOf = (id: number) => entryOf(id)?.position ?? Number.NaN;
    expect(entryOf(result.id)?.projectBlock).toBe(10);
    expect(entryOf(result.id)?.parentId).toBeNull();
    expect(positionOf(result.id)).toBeGreaterThan(positionOf(2));
    expect(positionOf(result.id)).toBeLessThan(positionOf(4));
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing and says the project is gone when the block is no longer a project", async () => {
    const { repository, quickCaptureInProject } = setup();
    // The window opened for it; its project tag removed since.
    repository.addBlock(10, { text: "Move house" });

    expect(await quickCaptureInProject(10, "Pack the books")).toEqual({
      kind: "projectGone",
    });
    expect(repository.writeCount()).toBe(0);
    expect((await repository.readTaskGraph()).tasks).toEqual([]);
  });

  it("writes nothing and says the project is gone when the project was dropped", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    await createDropProject({ repository })(10);
    const writesBefore = repository.writeCount();

    expect(await quickCaptureInProject(10, "Pack the books")).toEqual({
      kind: "projectGone",
    });
    expect(repository.writeCount()).toBe(writesBefore);
  });

  it("writes nothing and says the project is gone when its block was deleted", async () => {
    const { repository, quickCaptureInProject } = setup();

    expect(await quickCaptureInProject(10, "Pack the books")).toEqual({
      kind: "projectGone",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing and says the project is gone while the project tag is paused", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.pauseProjectTag(true);

    expect(await quickCaptureInProject(10, "Pack the books")).toEqual({
      kind: "projectGone",
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes nothing for blank text, even with initial properties", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house" });

    expect(
      await quickCaptureInProject(10, "  ", {
        importance: 7,
        due: { year: 2026, month: 10, day: 20 },
      }),
    ).toEqual({ kind: "empty" });
    expect(repository.writeCount()).toBe(0);
  });

  it("writes the initial properties given, the others keep their defaults", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house" });

    const result = await quickCaptureInProject(10, "Call the movers", {
      importance: 6,
      effort: 2,
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 10, day: 24 },
    });

    if (result.kind !== "captured") throw new Error("not captured");
    expect(await repository.getTask(result.id)).toMatchObject({
      status: "inbox",
      importance: 6,
      urgency: 4,
      effort: 2,
      start: { year: 2026, month: 10, day: 20 },
      due: { year: 2026, month: 10, day: 24 },
    });
  });

  it("belongs to the project by where it is, with no setting of its own", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house", status: "active" });

    const result = await quickCaptureInProject(10, "Pack the books");

    if (result.kind !== "captured") throw new Error("not captured");
    const read = await createReadProjectOfTask({ repository })(result.id);
    expect(read.project).toEqual({
      id: 10,
      text: "Move house",
      status: "active",
    });
    expect(read.source).toEqual({ kind: "location" });
    expect(read.ownSetting).toBeNull();
  });

  it("becomes the last top-level block of a page project", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addProject({ id: 10, text: "Move house" }, { page: true });
    repository.addTask({ id: 1 }, { parentId: 10 });

    const result = await quickCaptureInProject(10, "Pack the books");

    if (result.kind !== "captured") throw new Error("not captured");
    const { tasks } = await repository.readTaskGraph();
    const entryOf = (id: number) => tasks.find((item) => item.task.id === id);
    expect(entryOf(result.id)?.projectBlock).toBe(10);
    expect(entryOf(result.id)?.parentId).toBeNull();
    expect(entryOf(result.id)?.position).toBeGreaterThan(
      entryOf(1)?.position ?? Number.NaN,
    );
  });

  it("becomes a subtask when the project block is also a task", async () => {
    const { repository, quickCaptureInProject } = setup();
    repository.addTask({ id: 10, text: "Move house" });
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { parentId: 10 });

    const result = await quickCaptureInProject(10, "Pack the books");

    if (result.kind !== "captured") throw new Error("not captured");
    const { tasks } = await repository.readTaskGraph();
    const children = tasks
      .filter((item) => item.parentId === 10)
      .sort((a, b) => a.position - b.position)
      .map((item) => item.task.id);
    expect(children).toEqual([1, result.id]);
    expect(repository.writeCount()).toBe(1);
  });
});
