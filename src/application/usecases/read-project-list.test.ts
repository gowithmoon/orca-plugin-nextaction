import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import { createReadAllTasks } from "./read-all-tasks";
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
  const readAllTasks = createReadAllTasks({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readProjectList, readAllTasks };
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

  it("orders a group as the all tasks view sorted by score orders its project rows", async () => {
    const { repository, readProjectList, readAllTasks } = setup();
    const day = (month: number, d: number) => ({ year: 2026, month, day: d });
    // Scores and tasks as in the test above; a task of each project, which
    // does not change its score, keeps the rows in the all tasks view.
    repository.addProject({ id: 1, status: "active" });
    repository.addProject({ id: 2, status: "active", start: day(10, 29) });
    repository.addProject({ id: 3, status: "active", due: day(10, 9) });
    repository.addProject({ id: 4, status: "active" });
    repository.addProject({ id: 5, status: "active", importance: 7 });
    for (const id of [1, 2, 3, 4, 5])
      repository.addTask({ id: id + 10, status: "todo" }, { parentId: id });

    const list = await readProjectList();
    const all = await readAllTasks({ sort: "score" });
    const rows = all.tree.flatMap((node) =>
      node.kind === "project" ? [node.project.id] : [],
    );

    expect(groups(list)).toEqual([["active", [3, 5, 1, 4, 2]]]);
    expect(rows).toEqual([3, 5, 1, 4, 2]);
  });

  it("brings each project's days without progress and whether it is overdue", async () => {
    const { repository, readProjectList } = setup();
    const at = (iso: string) => new Date(iso);
    // Today is 2026-10-09. Project 1's latest progress is a task created
    // on 09-20: 19 days. Project 2's task was completed on 10-01: 8 days,
    // not yet. Project 3 was due on 10-08.
    repository.addProject({
      id: 1,
      status: "active",
      created: at("2026-09-01T10:00:00+08:00"),
    });
    repository.addTask(
      { id: 2, status: "todo", created: at("2026-09-20T10:00:00+08:00") },
      { parentId: 1 },
    );
    repository.addProject({
      id: 3,
      status: "active",
      created: at("2026-09-01T10:00:00+08:00"),
    });
    repository.addTask(
      { id: 4, status: "done", created: at("2026-09-01T10:00:00+08:00") },
      {
        parentId: 3,
        completionHistory: {
          kind: "readable",
          history: [
            {
              at: at("2026-10-01T10:00:00+08:00"),
              day: { year: 2026, month: 10, day: 1 },
            },
          ],
        },
      },
    );
    repository.addProject({
      id: 5,
      status: "planning",
      due: { year: 2026, month: 10, day: 8 },
    });

    const read = await readProjectList();
    if (read.kind !== "projects") throw new Error(read.kind);
    const byId = new Map(
      read.groups
        .flatMap((group) => group.projects)
        .map((node) => [node.project.id, node]),
    );

    expect(byId.get(1)?.noProgressDays).toBe(19);
    expect(byId.get(1)?.overdue).toBe(false);
    expect(byId.get(3)?.noProgressDays).toBe(null);
    expect(byId.get(5)?.noProgressDays).toBe(null);
    expect(byId.get(5)?.overdue).toBe(true);
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
