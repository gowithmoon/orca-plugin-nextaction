import { describe, expect, it } from "vitest";
import {
  lacksNextAction,
  type ProjectTask,
  projectProgress,
  unfinishedTaskCount,
} from "./progress";
import type { Project } from "./project";

const task = (overrides: Partial<ProjectTask> = {}): ProjectTask => ({
  status: "todo",
  effort: 4,
  recurs: false,
  doneAncestor: false,
  nextAction: false,
  ...overrides,
});

const project = (overrides: Partial<Project> = {}): Project => ({
  id: 10,
  text: "Move house",
  status: "active",
  goal: null,
  start: null,
  due: null,
  importance: 4,
  urgency: 4,
  created: new Date(2026, 0, 1),
  ...overrides,
});

describe("进度: a project's progress", () => {
  it("a project no task belongs to has no tasks, not 0%", () => {
    expect(projectProgress([])).toEqual({ kind: "noTasks" });
  });

  it("someday and recurring tasks do not count: none counted is uncounted", () => {
    expect(
      projectProgress([task({ status: "someday" }), task({ recurs: true })]),
    ).toEqual({ kind: "uncounted" });
  });

  it("is weighted by effort, done over all counted", () => {
    expect(
      projectProgress([
        task({ status: "done", effort: 1 }),
        task({ status: "doing", effort: 3 }),
        task({ status: "waiting", effort: 2 }),
      ]),
    ).toEqual({ kind: "measured", done: 1, total: 6 });
  });

  it("leaves someday and recurring tasks out of both sides", () => {
    expect(
      projectProgress([
        task({ status: "done", effort: 2 }),
        task({ status: "todo", effort: 2 }),
        task({ status: "someday", effort: 7 }),
        task({ status: "done", recurs: true, effort: 7 }),
      ]),
    ).toEqual({ kind: "measured", done: 2, total: 4 });
  });

  it("a task below a done ancestor task counts as done", () => {
    expect(
      projectProgress([
        task({ status: "done", effort: 2 }),
        task({ status: "todo", effort: 3, doneAncestor: true }),
        task({ status: "inbox", effort: 5 }),
      ]),
    ).toEqual({ kind: "measured", done: 5, total: 10 });
  });

  it("a parent and its subtask each count with their own effort", () => {
    // The parent (effort 6) done, its subtask (effort 1) below it.
    expect(
      projectProgress([
        task({ status: "done", effort: 6 }),
        task({ status: "done", effort: 1, doneAncestor: true }),
        task({ status: "todo", effort: 1 }),
      ]),
    ).toEqual({ kind: "measured", done: 7, total: 8 });
  });
});

describe("缺少下一步行动: a project lacking a next action", () => {
  it("an active, started project with neither a next action nor a waiting task lacks one", () => {
    expect(lacksNextAction(project(), true, [task(), task()])).toBe(true);
    expect(lacksNextAction(project(), true, [])).toBe(true);
  });

  it("one next action among its tasks is enough", () => {
    expect(
      lacksNextAction(project(), true, [task(), task({ nextAction: true })]),
    ).toBe(false);
  });

  it("a waiting task exempts it", () => {
    expect(
      lacksNextAction(project(), true, [task(), task({ status: "waiting" })]),
    ).toBe(false);
  });

  it("a project not yet started (start preview days counted by the caller) does not", () => {
    expect(lacksNextAction(project(), false, [task()])).toBe(false);
  });

  it("only an active project can lack one", () => {
    for (const status of ["planning", "paused", "someday", "done"] as const) {
      expect(lacksNextAction(project({ status }), true, [task()])).toBe(false);
    }
  });
});

describe("unfinished task count", () => {
  it("counts every task not done, someday and recurring included", () => {
    expect(
      unfinishedTaskCount([
        task({ status: "done" }),
        task({ status: "someday" }),
        task({ recurs: true }),
        task({ status: "waiting" }),
      ]),
    ).toBe(3);
    expect(unfinishedTaskCount([task({ status: "done" })])).toBe(0);
  });
});
