import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createFindOnTaskMap } from "./find-on-task-map";
import { createReadTaskMap, type TaskMapInput } from "./read-task-map";

function setup() {
  const repository = createInMemoryTaskRepository();
  const find = createFindOnTaskMap(
    createReadTaskMap({
      repository,
      clock: createFixedClock("2026-10-09T10:00:00+08:00"),
      dayBoundary: createFixedDayBoundary(),
      startPreviewDays: createFixedStartPreviewDays(),
    }),
  );
  return { repository, find };
}

/** The view's defaults: every area, done tasks and tasks with no relation hidden. */
const defaults: TaskMapInput = {
  projects: [],
  showDone: false,
  showUnrelated: false,
};

describe("find on task map, locating a task", () => {
  it("keeps the filter for a task the map shows, naming the boxes around it", async () => {
    const { repository, find } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });

    expect(await find.locate(defaults, 2)).toEqual({
      input: defaults,
      project: null,
      parents: [1],
    });
  });

  it("adds the task's area to the areas chosen when the project filter leaves it out", async () => {
    const { repository, find } = setup();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask({ id: 1, status: "todo" }, { parentId: 10 });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });

    expect(await find.locate({ ...defaults, projects: ["none"] }, 1)).toEqual({
      input: { ...defaults, projects: ["none", 10] },
      project: 10,
      parents: [],
    });
    expect(await find.locate({ ...defaults, projects: [10] }, 2)).toEqual({
      input: { ...defaults, projects: [10, "none"] },
      project: null,
      parents: [],
    });
  });

  it("turns on done tasks only for a done task the map hides", async () => {
    const { repository, find } = setup();
    repository.addTask({ id: 1, status: "done" });
    repository.addTask({ id: 2, status: "todo", dependencies: [1] });
    // Done, but the box of a subtask not done: shown anyway.
    repository.addTask({ id: 3, status: "done" });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 3 });

    expect((await find.locate(defaults, 1))?.input).toEqual({
      ...defaults,
      showDone: true,
    });
    expect((await find.locate(defaults, 3))?.input).toEqual(defaults);
  });

  it("turns on tasks with no relation for one, and both toggles for a done one", async () => {
    const { repository, find } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addTask({ id: 2, status: "done" });

    expect((await find.locate(defaults, 1))?.input).toEqual({
      ...defaults,
      showUnrelated: true,
    });
    expect((await find.locate(defaults, 2))?.input).toEqual({
      ...defaults,
      showDone: true,
      showUnrelated: true,
    });
  });

  it("finds nothing for a block that is no task", async () => {
    const { find } = setup();

    expect(await find.locate(defaults, 99)).toBeNull();
  });
});

describe("find on task map, searching", () => {
  it("finds every task holding each word in its text or search text, in map order, whatever the filter hides", async () => {
    const { repository, find } = setup();
    repository.addProject({ id: 10, status: "active" });
    repository.addTask(
      { id: 1, status: "todo", text: "Pack the boxes" },
      { parentId: 10 },
    );
    repository.addTask({ id: 2, status: "done", text: "Buy boxes" });
    repository.addTask({
      id: 3,
      status: "todo",
      text: "Call",
      searchText: "pack van",
    });
    repository.addTask({ id: 4, status: "todo", text: "Book van" });

    expect(await find.search("pack")).toEqual([1, 3]);
    expect(await find.search("boxes")).toEqual([1, 2]);
    expect(await find.search("  ")).toEqual([]);
  });
});
