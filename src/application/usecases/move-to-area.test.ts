import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createMoveToArea, createReadMoveToArea } from "./move-to-area";

function setup() {
  const repository = createInMemoryTaskRepository();
  const clock = createFixedClock("2026-10-21T02:00:00+08:00");
  const readMoveToArea = createReadMoveToArea({ repository });
  const moveToArea = createMoveToArea({ repository, clock });
  /** Task `id` as the task graph reads it. */
  const read = async (id: number) =>
    (await repository.readTaskGraph()).tasks.find((t) => t.task.id === id);
  return { repository, clock, readMoveToArea, moveToArea, read };
}

describe("plan placing a task in a project's box", () => {
  it("a page task can go under the project block or just set it", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 }, { page: true });

    expect(await readMoveToArea(1, { kind: "project", project: 10 })).toEqual({
      kind: "choose",
      moveUnderProject: { feasible: true, clearsOwnSetting: false },
      setProjectOnly: { feasible: true },
    });
  });

  it("moving under the project block clears its own setting of another project", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1 }, { project: [11] });

    expect(await readMoveToArea(1, { kind: "project", project: 10 })).toEqual({
      kind: "choose",
      moveUnderProject: { feasible: true, clearsOwnSetting: true },
      setProjectOnly: { feasible: true },
    });
  });

  it("setting the project only is not feasible when a parent task's ownership decides, naming it", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1, text: "Book flights" }, { project: [11] });
    repository.addTask({ id: 2, text: "Pick seats" }, { parentId: 1 });

    expect(await readMoveToArea(2, { kind: "project", project: 10 })).toEqual({
      kind: "choose",
      moveUnderProject: { feasible: true, clearsOwnSetting: false },
      setProjectOnly: {
        feasible: false,
        reason: {
          kind: "decidedByParentTask",
          task: { id: 1, text: "Book flights" },
        },
      },
    });
  });

  it("moving under the project block is not feasible when the block sits below a task deciding another project", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1, text: "Plan the year" }, { project: [11] });
    // A project block below task 1 (ADR 0025): task 1 still decides there.
    repository.addProject({ id: 10, text: "Move house" }, { parentId: 1 });
    repository.addTask({ id: 2, text: "Pack" });

    expect(await readMoveToArea(2, { kind: "project", project: 10 })).toEqual({
      kind: "choose",
      moveUnderProject: {
        feasible: false,
        reason: {
          kind: "decidedByParentTask",
          task: { id: 1, text: "Plan the year" },
        },
      },
      setProjectOnly: { feasible: true },
    });
  });

  it("moving under the project block is not feasible when the block is below the task itself", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addTask({ id: 1, text: "Plan the year" });
    repository.addProject({ id: 10, text: "Move house" }, { parentId: 1 });

    expect(await readMoveToArea(1, { kind: "project", project: 10 })).toEqual({
      kind: "choose",
      moveUnderProject: { feasible: false, reason: { kind: "ontoSelf" } },
      setProjectOnly: { feasible: true },
    });
  });

  it("neither way is feasible for a task dropped on its own project's box", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addTask({ id: 1, text: "Move house" });
    repository.addProject({ id: 1 });

    expect(await readMoveToArea(1, { kind: "project", project: 1 })).toEqual({
      kind: "choose",
      moveUnderProject: { feasible: false, reason: { kind: "ontoSelf" } },
      setProjectOnly: { feasible: false, reason: { kind: "ontoSelf" } },
    });
  });

  it("nothing to do for a task already in the project, by its block or its setting", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 2 }, { project: [10] });
    repository.addTask({ id: 3 }, { parentId: 1 });

    for (const id of [1, 2, 3]) {
      expect(
        await readMoveToArea(id, { kind: "project", project: 10 }),
      ).toEqual({ kind: "nothing" });
    }
  });
});

describe("plan placing a task in the no-project area", () => {
  it("a task belonging by its own setting only gets the setting cleared", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 }, { project: [10] });

    expect(await readMoveToArea(1, { kind: "noProject" })).toEqual({
      kind: "leave",
      clearsOwnSetting: true,
      toJournal: false,
    });
  });

  it("a task belonging by its project block only goes to today's journal", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 }, { parentId: 10 });

    expect(await readMoveToArea(1, { kind: "noProject" })).toEqual({
      kind: "leave",
      clearsOwnSetting: false,
      toJournal: true,
    });
  });

  it("a task with both its setting and a project block gets both", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1 }, { parentId: 10, project: [11] });

    expect(await readMoveToArea(1, { kind: "noProject" })).toEqual({
      kind: "leave",
      clearsOwnSetting: true,
      toJournal: true,
    });
  });

  it("a subtask whose parent task decides goes to the journal, its own overridden setting cleared too", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1 }, { project: [10] });
    repository.addTask({ id: 2 }, { parentId: 1 });
    // Overridden by its parent task; it would count again in the journal.
    repository.addTask({ id: 3 }, { parentId: 1, project: [11] });

    expect(await readMoveToArea(2, { kind: "noProject" })).toEqual({
      kind: "leave",
      clearsOwnSetting: false,
      toJournal: true,
    });
    expect(await readMoveToArea(3, { kind: "noProject" })).toEqual({
      kind: "leave",
      clearsOwnSetting: true,
      toJournal: true,
    });
  });

  it("nothing to do for a task belonging to no project, a stale setting included", async () => {
    const { repository, readMoveToArea } = setup();
    repository.addBlock(20, { text: "Not a project" });
    repository.addTask({ id: 1 });
    repository.addTask({ id: 2 }, { project: [20] });

    for (const id of [1, 2]) {
      expect(await readMoveToArea(id, { kind: "noProject" })).toEqual({
        kind: "nothing",
      });
    }
  });
});

describe("move a task to an area", () => {
  it("moving under the project block moves it to the block's end, its other setting cleared, in one write", async () => {
    const { repository, moveToArea, read } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addProject({ id: 11, text: "Year-end trip" });
    repository.addTask({ id: 1 }, { project: [11] });

    await moveToArea(1, { kind: "project", project: 10 }, "moveUnderProject");

    expect(await read(1)).toMatchObject({ projectBlock: 10 });
    expect((await read(1))?.projectSetting).toBeUndefined();
    expect(repository.writeCount()).toBe(1);
  });

  it("setting the project only writes the setting, the block staying where it is", async () => {
    const { repository, moveToArea, read } = setup();
    repository.addProject({ id: 10, text: "Move house" });
    repository.addTask({ id: 1 });

    await moveToArea(1, { kind: "project", project: 10 }, "setProjectOnly");

    expect(await read(1)).toMatchObject({
      projectSetting: { target: 10 },
      parentId: null,
    });
    expect((await read(1))?.projectBlock).toBeUndefined();
    expect(repository.moves()).toEqual([]);
    expect(repository.writeCount()).toBe(1);
  });

  it("a way that is not feasible writes nothing", async () => {
    const { repository, moveToArea } = setup();
    repository.addProject({ id: 10 });
    repository.addProject({ id: 11 });
    repository.addTask({ id: 1, text: "Book flights" }, { project: [11] });
    repository.addTask({ id: 2 }, { parentId: 1 });

    await expect(
      moveToArea(2, { kind: "project", project: 10 }, "setProjectOnly"),
    ).rejects.toMatchObject({
      name: "MoveToAreaInfeasibleError",
      reason: { kind: "decidedByParentTask", task: { id: 1 } },
    });
    expect(repository.writeCount()).toBe(0);
  });

  it("to the no-project area by its setting only: the setting cleared, in one write", async () => {
    const { repository, moveToArea, read } = setup();
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { project: [10] });

    await moveToArea(1, { kind: "noProject" });

    expect((await read(1))?.projectSetting).toBeUndefined();
    expect(repository.journalOf(1)).toBeUndefined();
    expect(repository.writeCount()).toBe(1);
  });

  it("to the no-project area by its project block: to the end of today's natural-day journal, out of its parent task", async () => {
    const { repository, moveToArea, read } = setup();
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 2 }, { parentId: 1 });
    repository.addTask({ id: 3 }, { parentId: 2 });

    await moveToArea(2, { kind: "noProject" });

    // 02:00 on the 21st, before the day boundary: still the 21st's journal.
    expect(repository.journalOf(2)).toEqual({ year: 2026, month: 10, day: 21 });
    expect(await read(2)).toMatchObject({ parentId: null });
    expect((await read(2))?.projectBlock).toBeUndefined();
    // Its subtask goes with it.
    expect(await read(3)).toMatchObject({ parentId: 2 });
    expect(repository.writeCount()).toBe(1);
  });

  it("to the no-project area by both: moved to the journal and the setting cleared, in one write", async () => {
    const { repository, moveToArea, read } = setup();
    repository.addProject({ id: 10 });
    repository.addProject({ id: 11 });
    repository.addTask({ id: 1 }, { parentId: 10, project: [11] });

    await moveToArea(1, { kind: "noProject" });

    expect(repository.journalOf(1)).toEqual({ year: 2026, month: 10, day: 21 });
    expect((await read(1))?.projectSetting).toBeUndefined();
    expect((await read(1))?.projectBlock).toBeUndefined();
    expect(repository.writeCount()).toBe(1);
  });

  it("writes nothing for a task already belonging there", async () => {
    const { repository, moveToArea } = setup();
    repository.addProject({ id: 10 });
    repository.addTask({ id: 1 }, { parentId: 10 });
    repository.addTask({ id: 2 });

    await moveToArea(1, { kind: "project", project: 10 }, "moveUnderProject");
    await moveToArea(2, { kind: "noProject" });

    expect(repository.writeCount()).toBe(0);
  });
});
