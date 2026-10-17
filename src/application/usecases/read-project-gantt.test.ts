import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../tests/fixed-clock";
import { createFixedDayBoundary } from "../../../tests/fixed-day-boundary";
import { createFixedStartPreviewDays } from "../../../tests/fixed-start-preview-days";
import { createInMemoryTaskRepository } from "../../../tests/in-memory-task-repository";
import type { TaskId } from "../../domain/task/task";
import {
  createReadProjectGantt,
  type ProjectGanttRead,
} from "./read-project-gantt";

/** 2026-10-09 10:00 in UTC+8: the logical day 2026-10-09. */
const morning = "2026-10-09T10:00:00+08:00";

function setup() {
  const repository = createInMemoryTaskRepository();
  const readProjectGantt = createReadProjectGantt({
    repository,
    clock: createFixedClock(morning),
    dayBoundary: createFixedDayBoundary(),
    startPreviewDays: createFixedStartPreviewDays(),
  });
  return { repository, readProjectGantt };
}

/** The gantt chart of a project; fails the test for no project. */
function gantt(
  read: ProjectGanttRead,
): Extract<ProjectGanttRead, { kind: "project" }> {
  if (read.kind !== "project") throw new Error(read.kind);
  return read;
}

function day(year: number, month: number, date: number) {
  return { year, month, day: date };
}

/** Each row: its task, its depth, its parent task. */
function rows(read: ProjectGanttRead): [TaskId, number, TaskId | null][] {
  return gantt(read).gantt.rows.map((row) => [
    row.task.id,
    row.depth,
    row.parentId,
  ]);
}

describe("read project gantt, rows", () => {
  it("lists the project's tasks in note order with their depth and parent task: outside the project block too, not another project's below it", async () => {
    const { repository, readProjectGantt } = setup();
    // Set to project 1 from a journal, above the project block.
    repository.addTask({ id: 7, status: "todo" }, { project: [1] });
    repository.addTask({ id: 8, status: "todo" }, { parentId: 7 });
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox" }, { parentId: 2 });
    repository.addTask({ id: 6, status: "doing" }, { parentId: 3 });
    // Under project 1's block, set to project 5: not project 1's.
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 4, status: "todo" },
      { parentId: 1, project: [5] },
    );
    repository.addTask({ id: 10, status: "todo" }, { parentId: 1 });
    // Not the project's at all.
    repository.addTask({ id: 9, status: "todo" });

    const read = await readProjectGantt({ project: 1 });

    expect(rows(read)).toEqual([
      [7, 0, null],
      [8, 1, 7],
      [2, 0, null],
      [3, 1, 2],
      [6, 2, 3],
      [10, 0, null],
    ]);
  });
});

describe("read project gantt, bars", () => {
  it("draws a task with both dates as a bar from its start to its due date, one outside the project's dates too", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });
    repository.addTask(
      {
        id: 2,
        status: "todo",
        start: day(2026, 10, 5),
        due: day(2026, 10, 12),
      },
      { parentId: 1 },
    );
    // Before the project's start, after its due date.
    repository.addTask(
      {
        id: 3,
        status: "todo",
        start: day(2026, 9, 20),
        due: day(2026, 11, 8),
      },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.rows.map((row) => [row.task.id, row.bar])).toEqual([
      [
        2,
        {
          kind: "bar",
          start: day(2026, 10, 5),
          due: day(2026, 10, 12),
          borrowed: "none",
        },
      ],
      [
        3,
        {
          kind: "bar",
          start: day(2026, 9, 20),
          due: day(2026, 11, 8),
          borrowed: "none",
        },
      ],
    ]);
  });

  it("gives the project's start and due dates and today", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({
      id: 1,
      status: "active",
      start: day(2026, 10, 1),
      due: day(2026, 10, 31),
    });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.gantt.projectStart).toEqual(day(2026, 10, 1));
    expect(read.gantt.projectDue).toEqual(day(2026, 10, 31));
    expect(read.gantt.today).toEqual(day(2026, 10, 9));
  });
});

describe("read project gantt, filtered and searched", () => {
  it("keeps a row when its task or any descendant task is found, in note order", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", text: "Plan" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", text: "Draft" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 4, status: "todo", text: "Call printer" },
      { parentId: 3 },
    );
    repository.addTask(
      { id: 5, status: "todo", text: "Budget" },
      { parentId: 2 },
    );
    repository.addTask(
      { id: 6, status: "todo", text: "Venue" },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 7, status: "todo", text: "Call venue" },
      { parentId: 1 },
    );

    const read = await readProjectGantt({ project: 1, search: "call" });

    expect(rows(read)).toEqual([
      [2, 0, null],
      [3, 1, 2],
      [4, 2, 3],
      [7, 0, null],
    ]);
  });

  it("narrows by the filter as the tree does, the status filter too", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "todo" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "doing" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "waiting" }, { parentId: 1 });
    repository.addTask({ id: 5, status: "done" }, { parentId: 1 });

    const read = await readProjectGantt({
      project: 1,
      filter: { statuses: ["doing"] },
    });

    expect(rows(read)).toEqual([
      [2, 0, null],
      [3, 1, 2],
    ]);
  });
});

describe("read project gantt, no project", () => {
  it("reads no project for a block that is not a project", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addTask({ id: 1, status: "todo" });
    repository.addBlock(2);

    expect(await readProjectGantt({ project: 1 })).toEqual({
      kind: "noProject",
    });
    expect(await readProjectGantt({ project: 2 })).toEqual({
      kind: "noProject",
    });
  });

  it("reads no project while the project tag is paused", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.pauseProjectTag(true);

    expect(await readProjectGantt({ project: 1 })).toEqual({
      kind: "noProject",
    });
  });

  it("brings the project as the project details' attribute area shows it", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, text: "Move house", status: "active" });
    repository.addTask({ id: 2, status: "done", effort: 2 }, { parentId: 1 });
    repository.addTask({ id: 3, status: "inbox", effort: 6 }, { parentId: 1 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(read.project.project.text).toBe("Move house");
    expect(read.project.progress).toEqual({
      kind: "measured",
      done: 2,
      total: 8,
    });
  });
});

describe("read project gantt, dependencies", () => {
  it("gives a row its dependencies on the project's tasks, from the task depended on to it, with its dependency delay", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask({ id: 2, status: "done" }, { parentId: 1 });
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask(
      { id: 4, status: "todo", dependencies: [3, 2], dependencyDelay: 2 },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 5, status: "todo", dependencies: [4] },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.map((row) => [row.task.id, row.dependencies]),
    ).toEqual([
      [2, []],
      [3, []],
      [
        4,
        [
          { from: 3, to: 4, delay: 2 },
          { from: 2, to: 4, delay: 2 },
        ],
      ],
      [5, [{ from: 4, to: 5, delay: 0 }]],
    ]);
  });

  it("marks a dependency on a task outside the project with the task's text, not as an arrow; a stale one not at all", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addProject({ id: 5, status: "active" });
    repository.addTask(
      { id: 6, status: "todo", text: "Sign the lease" },
      { parentId: 5 },
    );
    repository.addTask({ id: 7, status: "done", text: "Ask Wang" });
    // Not a task any more: a stale dependency.
    repository.addBlock(8);
    repository.addTask(
      { id: 2, status: "todo", dependencies: [6, 8, 9, 7] },
      { parentId: 1 },
    );
    repository.addTask(
      { id: 3, status: "todo", dependencies: [2] },
      { parentId: 1 },
    );

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.map((row) => [
        row.task.id,
        row.dependencies,
        row.outsideDependencies,
      ]),
    ).toEqual([
      [
        2,
        [],
        [
          { task: 6, text: "Sign the lease" },
          { task: 7, text: "Ask Wang" },
        ],
      ],
      [3, [{ from: 2, to: 3, delay: 0 }], []],
    ]);
  });

  it("gives no dependency for doing subtasks one after another", async () => {
    const { repository, readProjectGantt } = setup();
    repository.addProject({ id: 1, status: "active" });
    repository.addTask(
      { id: 2, status: "todo", sequential: true },
      { parentId: 1 },
    );
    repository.addTask({ id: 3, status: "todo" }, { parentId: 2 });
    repository.addTask({ id: 4, status: "todo" }, { parentId: 2 });

    const read = gantt(await readProjectGantt({ project: 1 }));

    expect(
      read.gantt.rows.flatMap((row) => [
        ...row.dependencies,
        ...row.outsideDependencies,
      ]),
    ).toEqual([]);
  });
});
