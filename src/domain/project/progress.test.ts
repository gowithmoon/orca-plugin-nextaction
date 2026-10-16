import { describe, expect, it } from "vitest";
import {
  daysWithoutProgress,
  lacksNextAction,
  type ProjectTask,
  projectOverdue,
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

describe("长期无进展: a project with no recent progress", () => {
  const boundary = { hours: 5, minutes: 0 };
  const created = new Date(2026, 0, 1, 12, 0);
  const none = { lastCompletion: null, lastTaskCreated: null };
  const day = (month: number, d: number) => ({ year: 2026, month, day: d });

  it("13 days after the latest progress is not yet; 14 is, with the days", () => {
    const fresh = project({ created });
    expect(daysWithoutProgress(fresh, true, none, day(1, 14), boundary)).toBe(
      null,
    );
    expect(daysWithoutProgress(fresh, true, none, day(1, 15), boundary)).toBe(
      14,
    );
    expect(daysWithoutProgress(fresh, true, none, day(2, 1), boundary)).toBe(
      31,
    );
  });

  it("only an active project can have none", () => {
    for (const status of ["planning", "paused", "someday", "done"] as const) {
      expect(
        daysWithoutProgress(
          project({ status, created }),
          true,
          none,
          day(3, 1),
          boundary,
        ),
      ).toBe(null);
    }
  });

  it("a project not yet started (start preview days counted by the caller) does not", () => {
    expect(
      daysWithoutProgress(
        project({ created }),
        false,
        none,
        day(3, 1),
        boundary,
      ),
    ).toBe(null);
  });

  it("the latest last completion of its tasks, when latest, starts the count", () => {
    const activity = { lastCompletion: day(2, 1), lastTaskCreated: null };
    expect(
      daysWithoutProgress(
        project({ created }),
        true,
        activity,
        day(2, 14),
        boundary,
      ),
    ).toBe(null);
    expect(
      daysWithoutProgress(
        project({ created }),
        true,
        activity,
        day(2, 15),
        boundary,
      ),
    ).toBe(14);
  });

  it("the latest creation of its tasks, when latest, starts the count", () => {
    const activity = {
      lastCompletion: day(1, 10),
      lastTaskCreated: new Date(2026, 1, 1, 12, 0),
    };
    expect(
      daysWithoutProgress(
        project({ created }),
        true,
        activity,
        day(2, 15),
        boundary,
      ),
    ).toBe(14);
  });

  it("a creation before the day boundary falls in the previous logical day", () => {
    const activity = {
      lastCompletion: null,
      lastTaskCreated: new Date(2026, 1, 2, 4, 30),
    };
    expect(
      daysWithoutProgress(
        project({ created }),
        true,
        activity,
        day(2, 15),
        boundary,
      ),
    ).toBe(14);
  });

  it("the project's start, when latest, starts the count", () => {
    const later = project({ created, start: day(3, 1) });
    const activity = { lastCompletion: day(2, 1), lastTaskCreated: null };
    expect(
      daysWithoutProgress(later, true, activity, day(3, 14), boundary),
    ).toBe(null);
    expect(
      daysWithoutProgress(later, true, activity, day(3, 15), boundary),
    ).toBe(14);
  });

  it("a start still ahead, within the start preview days, is not yet without progress", () => {
    const ahead = project({ created, start: day(3, 20) });
    expect(daysWithoutProgress(ahead, true, none, day(3, 15), boundary)).toBe(
      null,
    );
  });

  it("is independent of lacking a next action: both can hold", () => {
    const old = project({ created });
    const waiting = [task({ status: "waiting" })];
    expect(lacksNextAction(old, true, waiting)).toBe(false);
    expect(daysWithoutProgress(old, true, none, day(3, 1), boundary)).toBe(59);
    expect(lacksNextAction(old, true, [task()])).toBe(true);
  });

  it("without tasks or completions, counts from the start when it is later than the block's creation", () => {
    const later = project({ created, start: day(2, 1) });
    expect(daysWithoutProgress(later, true, none, day(2, 15), boundary)).toBe(
      14,
    );
  });
});

describe("逾期项目: an overdue project", () => {
  const today = { year: 2026, month: 3, day: 10 };

  it("is not done and its due day is before today", () => {
    expect(
      projectOverdue(project({ due: { year: 2026, month: 3, day: 9 } }), today),
    ).toBe(true);
  });

  it("due today is not overdue", () => {
    expect(projectOverdue(project({ due: today }), today)).toBe(false);
  });

  it("a done project is not overdue", () => {
    expect(
      projectOverdue(
        project({ status: "done", due: { year: 2026, month: 3, day: 1 } }),
        today,
      ),
    ).toBe(false);
  });

  it("a project without a due day is not overdue", () => {
    expect(projectOverdue(project({ due: null }), today)).toBe(false);
  });
});
