import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import {
  createReadProjectList,
  type ProjectListRead,
} from "./read-project-list";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectList = createReadProjectList({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readProjectList };
}

/** The groups as their project status and the IDs of their projects. */
function groups(read: ProjectListRead) {
  if (read.kind !== "projects") throw new Error(`read is ${read.kind}`);
  return read.groups.map((group) => [
    group.status,
    group.projects.map((node) => node.project.id),
  ]);
}

describe("read project list", () => {
  it("groups the projects by project status: active, planning, paused, someday, done; no empty group", async () => {
    const { repository, readProjectList } = setup();
    repository.addProject({ id: 1, status: "done" });
    repository.addProject({ id: 2, status: "someday" });
    repository.addProject({ id: 3, status: "planning" });
    repository.addProject({ id: 4, status: "active" });
    repository.addProject({ id: 5, status: "done" });
    repository.addProject({ id: 6, status: "paused" });

    const read = await readProjectList();

    expect(groups(read)).toEqual([
      ["active", [4]],
      ["planning", [3]],
      ["paused", [6]],
      ["someday", [2]],
      ["done", [1, 5]],
    ]);
  });

  it("brings each project's progress, whether it lacks a next action and how many tasks are not done", async () => {
    const { repository, readProjectList } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "done", effort: 2 }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox", effort: 6 }, { parentId: 1 });
    // Set to project 1 from a journal: it belongs to it too.
    repository.addTask({ id: 4, status: "inbox", effort: 4 }, { project: [1] });
    repository.addProject({ id: 5, status: "done" });
    repository.addTask({ id: 6, status: "todo" }, { parentId: 5 });

    const read = await readProjectList();
    if (read.kind !== "projects") throw new Error(read.kind);
    const [active, done] = read.groups.map((group) => group.projects[0]);

    expect(active?.progress).toEqual({ kind: "measured", done: 2, total: 12 });
    expect(active?.noNextAction).toBe(true);
    expect(active?.unfinished).toBe(2);
    expect(active?.taskCount).toBe(3);
    expect(done?.unfinished).toBe(1);
    expect(done?.noNextAction).toBe(false);
  });

  it("orders a group by project score, highest first, ties in note order", async () => {
    const { repository, readProjectList } = setup();
    const day = (month: number, d: number) => ({ year: 2026, month, day: d });
    // Scores on 2026-10-09, as the all tasks view's project rows: 1 and 4
    // 54.75; 2 (starts in 20 days) 36.75; 3 (due today) 77.5; 5 (importance
    // 7) 64.75.
    repository.addProject({ id: 1, status: "active" });
    repository.addProject({ id: 2, status: "active", start: day(10, 29) });
    repository.addProject({ id: 3, status: "active", due: day(10, 9) });
    repository.addProject({ id: 4, status: "active" });
    repository.addProject({ id: 5, status: "active", importance: 7 });

    const read = await readProjectList();

    expect(groups(read)).toEqual([["active", [3, 5, 1, 4, 2]]]);
  });

  it("reads no group when there is no project", async () => {
    const { repository, readProjectList } = setup();
    repository.addTask({ id: 1, status: "todo" });

    expect(await readProjectList()).toEqual({ kind: "projects", groups: [] });
  });

  it("reads as paused while the project tag is paused", async () => {
    const { repository, readProjectList } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.pauseProjectTag(true);

    expect(await readProjectList()).toEqual({ kind: "paused" });
  });
});
